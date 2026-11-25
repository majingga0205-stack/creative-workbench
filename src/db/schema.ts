// 레코드 검사용 zod 스키마 (현재 schemaVersion 기준). Dexie를 import하지 않는다.
import { z } from 'zod';

const isoDate = z.string().min(1, '날짜가 비어 있어요');

export const workSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: z.enum(['소설', '게임', '기타']),
  setting: z
    .object({
      label: z.string(),
      yearFrom: z.number().int(),
      yearTo: z.number().int(),
      region: z.string(),
    })
    .refine((s) => s.yearFrom <= s.yearTo, { message: '시대 설정의 시작 연도가 끝 연도보다 늦어요' })
    .optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const characterSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  name: z.string(),
  aliases: z.array(z.string()),
  archetypeId: z.string().optional(),
  traits: z.array(z.string()),
  note: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const chapterVersionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  text: z.string(),
  createdAt: isoDate,
});

export const chapterSchema = z
  .object({
    id: z.string().min(1),
    workId: z.string().min(1),
    number: z.number(),
    title: z.string(),
    versions: z.array(chapterVersionSchema).min(1, '버전이 하나 이상 있어야 해요'),
    activeVersionId: z.string().min(1),
    publishedAt: z.string().optional(),
    endingTag: z.enum(['절단', '여운', '정리']).optional(),
    endingTagSource: z.enum(['auto', 'user']).optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .refine((c) => c.versions.some((v) => v.id === c.activeVersionId), {
    message: '현재 버전(activeVersionId)이 버전 목록에 없어요',
    path: ['activeVersionId'],
  });

export const readerSnapshotSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  chapterId: z.string().min(1),
  recordedAt: z.string(),
  daysAfter: z.number().int(),
  values: z.record(z.string(), z.number()),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const hypothesisSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  statement: z.string(),
  condition: z.object({
    field: z.enum(['endingTag', 'dialogueRatio', 'length', 'custom']),
    op: z.enum(['=', '>', '<']),
    value: z.union([z.string(), z.number()]),
  }),
  metric: z.string(),
  target: z.enum(['same', 'next']),
  checkAfterChapter: z.number(),
  status: z.enum(['대기', '확인할 때 됨', '지지됨', '기각', '보류']),
  resultNote: z.string().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const settingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: isoDate,
});

/** 테이블 이름 → 레코드 스키마 */
export const RECORD_SCHEMAS: Record<string, z.ZodType> = {
  works: workSchema,
  characters: characterSchema,
  chapters: chapterSchema,
  readerSnapshots: readerSnapshotSchema,
  hypotheses: hypothesisSchema,
  settings: settingSchema,
};

export const envelopeHeaderSchema = z.object({
  app: z.string(),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  scope: z.enum(['all', 'work', 'lint', 'myth']),
  workId: z.string().optional(),
  workTitle: z.string().optional(),
  data: z.record(z.string(), z.array(z.unknown())),
});
