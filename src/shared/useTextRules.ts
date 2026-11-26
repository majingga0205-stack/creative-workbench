// 한국어 텍스트 규칙(조사·장면 구분 기호·인용 표현) 설정을 읽는 훅. 모든 모듈이 같은 규칙을 쓴다.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { readSetting } from '../db/meta';
import type { Setting } from '../db/types';

export type TextRules = { josa: string[]; sceneBreakSymbols: string[]; quotatives: string[] };

export function textRulesOf(rows: Setting[] | undefined): TextRules {
  return {
    josa: readSetting(rows, 'text.josa'),
    sceneBreakSymbols: readSetting(rows, 'text.sceneBreakSymbols'),
    quotatives: readSetting(rows, 'text.quotatives'),
  };
}

export function useTextRules(): TextRules | undefined {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  return useMemo(() => (rows ? textRulesOf(rows) : undefined), [rows]);
}
