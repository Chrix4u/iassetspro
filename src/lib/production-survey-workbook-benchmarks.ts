/**
 * Standards copied from "PRODUCTION SURVEY 2026.xlsx", sheet "prod survey",
 * machine work-centres B/C and benchmark columns AT / AV, rows 11–54.
 *
 * Defaults only. Planner must review values against each registered asset.
 * Codes not matched exactly are NOT guessed or seeded into other assets.
 * Speed units in the supplied workbook are yards/minute.
 */
export type SurveyBenchmark={machine:string;utilizationPct:number;speedYardsPerMinute:number};
export const WORKBOOK_PRODUCTION_BENCHMARKS:Record<string,SurveyBenchmark>={
 '312/1':{machine:'SINGEING M/C',utilizationPct:90,speedYardsPerMinute:130},
 '310/1':{machine:'BLEACHING RANGE',utilizationPct:80,speedYardsPerMinute:100},
 '314/1':{machine:'MERCERIZER',utilizationPct:81,speedYardsPerMinute:75},
 '340/6':{machine:'STENTER 6',utilizationPct:80,speedYardsPerMinute:85},
 '301/1':{machine:'WAX PRINT M/C',utilizationPct:67,speedYardsPerMinute:120},
 '374/1':{machine:'PRE-BREAKER M/C',utilizationPct:90,speedYardsPerMinute:50},
 '371/1':{machine:'CRACKLING M/C 1',utilizationPct:96,speedYardsPerMinute:18},
 '371/2':{machine:'CRACKLING M/C 2',utilizationPct:96,speedYardsPerMinute:12},
 '326/1':{machine:'IND. DYE M/C',utilizationPct:96,speedYardsPerMinute:30},
 '364/1':{machine:'AZOIC M/C',utilizationPct:60,speedYardsPerMinute:55},
 '372/1':{machine:'N.N.I. 1 M/C',utilizationPct:95,speedYardsPerMinute:22},
 '302/1':{machine:'FESTOON DRYER',utilizationPct:85,speedYardsPerMinute:28},
 '354/1':{machine:'FOULARD M/C',utilizationPct:70,speedYardsPerMinute:35},
 '304/1-14':{machine:'BLOCK TABLES',utilizationPct:90,speedYardsPerMinute:0.55},
 '342/1':{machine:'INSPECTION TABLE 1',utilizationPct:80,speedYardsPerMinute:50},
 '342/2':{machine:'INSPECTION TABLE 2',utilizationPct:80,speedYardsPerMinute:50},
 '342/3':{machine:'INSPECTION TABLE 3',utilizationPct:80,speedYardsPerMinute:50},
 '327/1':{machine:'TRI-X RANGE',utilizationPct:75,speedYardsPerMinute:60},
 '309/1':{machine:'ROPE SOAPER 1',utilizationPct:75,speedYardsPerMinute:50},
 '309/2':{machine:'ROPE SOAPER 2',utilizationPct:80,speedYardsPerMinute:50},
 '331/1':{machine:'C. DRY. RANGE 1',utilizationPct:85,speedYardsPerMinute:70},
 '331/2':{machine:'C. DRY. RANGE 2',utilizationPct:95,speedYardsPerMinute:70},
 '369/1':{machine:'SILICATE M/C',utilizationPct:80,speedYardsPerMinute:60},
 '333/1':{machine:'STEAMER',utilizationPct:80,speedYardsPerMinute:33},
 '350/1':{machine:'R.S.P. M/C 1',utilizationPct:80,speedYardsPerMinute:30},
 '350/2':{machine:'R.S.P. M/C 2',utilizationPct:60,speedYardsPerMinute:28},
 '350/3':{machine:'R.S.P. M/C 3',utilizationPct:80,speedYardsPerMinute:23},
 '350/4':{machine:'R.S.P. M/C 4',utilizationPct:80,speedYardsPerMinute:30},
 '350/5':{machine:'R.S.P. M/C 5',utilizationPct:80,speedYardsPerMinute:30},
 '348/1':{machine:'BAKING OVEN 2',utilizationPct:80,speedYardsPerMinute:46},
 '329/4':{machine:'ROPE WASHING M/C 4',utilizationPct:80,speedYardsPerMinute:80},
 '322/1':{machine:'O. WIDTH SOAPER',utilizationPct:80,speedYardsPerMinute:50},
 '340/5':{machine:'STENTER 5',utilizationPct:90,speedYardsPerMinute:75},
 '340/2':{machine:'STENTER 3',utilizationPct:95,speedYardsPerMinute:60},
 '347/1':{machine:'CALENDER',utilizationPct:95,speedYardsPerMinute:60},
 '343/1':{machine:'PLAITING M/C 1',utilizationPct:95,speedYardsPerMinute:18},
 '343/2':{machine:'PLAITING M/C 2',utilizationPct:95,speedYardsPerMinute:18},
 '343/3':{machine:'PLAITING M/C 3',utilizationPct:95,speedYardsPerMinute:18},
 '343/4':{machine:'PLAITING M/C 4',utilizationPct:95,speedYardsPerMinute:18},
 '343/5':{machine:'PLAITING M/C 5',utilizationPct:95,speedYardsPerMinute:18},
 '343/6':{machine:'PLAITING M/C 6',utilizationPct:95,speedYardsPerMinute:18},
 '343/7':{machine:'PLAITING M/C 7',utilizationPct:95,speedYardsPerMinute:18},
 '343/8':{machine:'PLAITING M/C 8',utilizationPct:90,speedYardsPerMinute:35},
 '387/1-8':{machine:'FOLDING TABLES',utilizationPct:90,speedYardsPerMinute:0},
};
export function getWorkbookBenchmark(assetTag:string):SurveyBenchmark|null{
 return WORKBOOK_PRODUCTION_BENCHMARKS[assetTag.trim().toUpperCase()]||null;
}
