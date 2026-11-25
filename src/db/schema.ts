// 레코드 검사용 zod 스키마 (현재 schemaVersion 기준). Dexie를 import하지 않는다.
import { z } from 'zod';

const isoDate = z.string().min(1, '날짜가 비어 있어요');

const settingFields = z
  .object({ label: z.string(), yearFrom: z.number().int(), yearTo: z.number().int(), region: z.string() })
  .refine((s) => s.yearFrom <= s.yearTo, { message: '시대 설정의 시작 연도가 끝 연도보다 늦어요' });

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
  nameRequiredAliases: z.array(z.string()).optional(),
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
    setting: settingFields.optional(),
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

const lintSourceSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  year: z.string().optional(),
  locator: z.string().optional(),
  type: z.enum(['1차 사료', '연구서·논문', '사전', '기타']),
  url: z.string().optional(),
});

export const lintEntrySchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  aliases: z.array(z.string()),
  matchMode: z.enum(['word', 'prefix']),
  exclude: z.array(z.string()),
  category: z.enum(['물건', '음식', '제도', '단어', '개념', '호칭', '기타']),
  kind: z.enum(['not_yet', 'meaning_shift']),
  region: z.string(),
  appears: z.object({ from: z.number(), to: z.number(), precision: z.enum(['연도', '시기', '세기']) }).optional(),
  senses: z.array(z.object({ label: z.string(), from: z.number().optional(), to: z.number().optional(), contextWords: z.array(z.string()) })).optional(),
  sources: z.array(lintSourceSchema),
  disputed: z.boolean(),
  disputeNote: z.string().optional(),
  verified: z.boolean(),
  note: z.string().optional(),
  updatedAt: isoDate,
});

export const glossarySchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  canonical: z.string().min(1),
  variants: z.array(z.string()),
  status: z.enum(['사용', '금지']),
  replacement: z.string().optional(),
  note: z.string().optional(),
  updatedAt: isoDate,
});

export const lintResolutionSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  ruleKey: z.string().min(1),
  status: z.enum(['의도함', '무시']),
  scope: z.enum(['position', 'chapter', 'work']),
  chapterId: z.string().optional(),
  context: z.string().optional(),
  note: z.string().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const networkEditSchema = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  a: z.string().min(1),
  b: z.string().min(1),
  action: z.enum(['add', 'remove', 'label']),
  label: z.string().optional(),
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
  glossary: glossarySchema,
  lintResolutions: lintResolutionSchema,
  networkEdits: networkEditSchema,
  lintEntries: lintEntrySchema,
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
