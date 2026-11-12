import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { aiChatCompletion } from '@/lib/ai-client';
import { PM_GUIDE_PAGES, PM_GUIDE_PAGE_IDS } from '@/lib/pm-guide-pages';

/** Navigation-only AI help: no asset records, DB writes or uncontrolled routes. */
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sign in to ask the PM guide' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.view')) {
    return NextResponse.json({ success: false, error: 'Not authorized for PM guidance' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 }); }
  const page = typeof body.page === 'string' ? body.page : '';
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!PM_GUIDE_PAGES[page] || !question || question.length > 600) {
    return NextResponse.json({ success: false, error: 'Choose a PM page and ask a question of up to 600 characters' }, { status: 400 });
  }
  const summary = PM_GUIDE_PAGE_IDS.map((id) => {
    const info = PM_GUIDE_PAGES[id];
    return id + ': ' + info.title + '. ' + info.purpose + ' Steps: ' + info.steps.join(' ');
  }).join('\n');
  try {
    const result = await aiChatCompletion({
      messages: [
        { role: 'system', content: 'You are the iAssetsPro PM navigation guide. Explain which screen to open and how to use it accurately and concisely. Only refer to the actual pages and features in this verified knowledge base; never invent buttons, permissions, date formats, backend outcomes or completed actions. Never issue instructions that bypass maintenance approvals or safety procedures. If uncertain, say you cannot verify it. Present page names and instructions in plain text, without code or markdown links.\n' + summary },
        { role: 'user', content: 'Current page: ' + page + '\nQuestion: ' + question },
      ],
      max_tokens: 450,
      temperature: 0.2,
    });
    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('No AI reply');
    return NextResponse.json({ success: true, data: { reply: answer.slice(0, 2400) } });
  } catch {
    return NextResponse.json({
      success: false,
      error: 'AI guidance is unavailable right now. Use the verified page instructions and navigation links shown in the guide.',
    }, { status: 503 });
  }
}
