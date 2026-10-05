import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeAssetPlant, authorizeComponentPlant } from '@/lib/plant-auth-helpers';

/**
 * Weibull Analysis — estimates shape (β) and scale (η) parameters
 * using Maximum Likelihood Estimation (MLE) approximation.
 */
function weibullMLE(timeBetweenFailures: number[]): { beta: number; eta: number } {
  const n = timeBetweenFailures.length;
  if (n < 2) return { beta: 1.0, eta: 0 };

  const filtered = timeBetweenFailures.filter((t) => t > 0);
  const m = filtered.length;
  if (m < 2) return { beta: 1.0, eta: 0 };

  // MLE for beta using iterative approach
  let beta = 1.0;
  for (let iter = 0; iter < 50; iter++) {
    const sumLnT = filtered.reduce((sum, t) => sum + Math.log(t), 0);
    const sumTlnT = filtered.reduce((sum, t) => sum + t * Math.log(t), 0);
    const sumTPowBeta = filtered.reduce((sum, t) => sum + Math.pow(t, beta), 0);
    const sumTPowBetaLnT = filtered.reduce((sum, t) => sum + Math.pow(t, beta) * Math.log(t), 0);

    const fBeta = (sumTPowBeta / m) * (1 / beta) - sumLnT / m + sumTPowBetaLnT / sumTPowBeta;
    const dfBeta = (sumTPowBeta / m) * (-1 / (beta * beta)) + (sumTPowBetaLnT * sumTPowBetaLnT) / (sumTPowBeta * sumTPowBeta);

    if (Math.abs(dfBeta) < 1e-12) break;
    const delta = fBeta / dfBeta;
    beta = beta - delta;
    if (beta <= 0.1) beta = 0.1;
    if (Math.abs(delta) < 1e-8) break;
  }

  beta = Math.max(0.1, Math.min(beta, 10));

  // MLE for eta (scale parameter)
  const sumTPowBeta = filtered.reduce((sum, t) => sum + Math.pow(t, beta), 0);
  const eta = Math.pow(sumTPowBeta / m, 1 / beta);

  return { beta: Math.round(beta * 1000) / 1000, eta: Math.round(eta * 100) / 100 };
}

function weibullReliability(t: number, beta: number, eta: number): number {
  if (eta <= 0) return 1;
  return Math.exp(-Math.pow(t / eta, beta));
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');

    if (!assetId && !componentId) {
      return NextResponse.json(
        { success: false, error: 'Either assetId or componentId is required' },
        { status: 400 },
      );
    }

    const plantAuth = componentId
      ? await authorizeComponentPlant(request, session, componentId)
      : await authorizeAssetPlant(request, session, assetId!);
    if (!plantAuth.ok) return plantAuth.response;

    // Gather failure records
    const failureWhere: Record<string, unknown> = {};
    if (componentId) {
      failureWhere.componentId = componentId;
    } else if (assetId) {
      failureWhere.assetId = assetId;
    }

    const failures = await db.failureRecord.findMany({
      where: failureWhere,
      orderBy: { detectedAt: 'asc' },
    });

    if (failures.length < 2) {
      return NextResponse.json({
        success: true,
        data: {
          parameters: { beta: null, eta: null },
          summary: {
            totalFailures: failures.length,
            insufficientData: true,
            message: 'At least 2 failure records are required for Weibull analysis',
          },
        },
      });
    }

    // Calculate time-between-failures (in hours)
    const tbf: number[] = [];
    for (let i = 1; i < failures.length; i++) {
      const prev = failures[i - 1].detectedAt;
      const curr = failures[i].detectedAt;
      if (prev && curr) {
        const hoursDiff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 0) {
          tbf.push(Math.round(hoursDiff * 100) / 100);
        }
      }
    }

    // Weibull MLE
    const { beta, eta } = weibullMLE(tbf);

    // Compute key life metrics
    const b10 = eta > 0 ? Math.round(eta * Math.pow(-Math.log(0.9), 1 / beta) * 100) / 100 : 0;
    const b50 = eta > 0 ? Math.round(eta * Math.pow(-Math.log(0.5), 1 / beta) * 100) / 100 : 0;

    // Mean life approximation using Stirling's for Gamma(1 + 1/beta)
    const oneOverBeta = 1 / beta;
    const intPart = Math.floor(oneOverBeta);
    const meanLife = Math.round(eta * factorial(intPart) * 100) / 100;

    // Reliability at intervals (hours)
    const intervals = [100, 500, 1000, 2000, 5000, 10000];
    const reliabilityAtIntervals = intervals.map((t) => ({
      hours: t,
      reliability: Math.round(weibullReliability(t, beta, eta) * 10000) / 100,
    }));

    // Failure rate classification
    let failurePattern: string;
    if (beta < 0.8) {
      failurePattern = 'infant_mortality';
    } else if (beta >= 0.8 && beta <= 1.2) {
      failurePattern = 'random_failure';
    } else if (beta > 1.2 && beta <= 3.0) {
      failurePattern = 'wear_out_early';
    } else {
      failurePattern = 'rapid_wear_out';
    }

    // CDF curve data
    const cdfCurve: Array<{ time: number; reliability: number; failureProb: number }> = [];
    if (eta > 0) {
      for (let i = 0; i <= 20; i++) {
        const t = (eta * 2.5 * i) / 20;
        const rel = weibullReliability(t, beta, eta);
        cdfCurve.push({
          time: Math.round(t * 100) / 100,
          reliability: Math.round(rel * 10000) / 100,
          failureProb: Math.round((1 - rel) * 10000) / 100,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        parameters: { beta, eta },
        summary: {
          totalFailures: failures.length,
          timeBetweenFailures: tbf,
          avgTBF: tbf.length > 0 ? Math.round(tbf.reduce((a, b) => a + b, 0) / tbf.length * 100) / 100 : 0,
          b10,
          b50,
          meanLife,
          failurePattern,
        },
        reliabilityAtIntervals,
        cdfCurve,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute Weibull analysis';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
