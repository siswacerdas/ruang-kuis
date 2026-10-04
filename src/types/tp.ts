/** Master Tujuan Pembelajaran Kelas 5 Fase C. */
export type SubjectKey =
  | 'bahasa-indonesia'
  | 'pendidikan-pancasila'
  | 'ipas'
  | 'seni-musik'
  | 'seni-rupa'
  | 'matematika'
  | 'al-islam'
  | 'bahasa-inggris'

export interface LearningObjective {
  id?: string
  code: string
  subjectKey: SubjectKey
  element: string
  order: number
  statement: string
  weight: number
  active: boolean
  className: string
  phase: string
  source?: string
  updatedAt?: any
}

export interface BookMaterial {
  id?: string
  subjectKey: SubjectKey
  title: string
  summary: string
  suggestedTpCodes: string[]
  linkNote?: string
  updatedAt?: any
}

export interface TpSeedFile {
  version?: string
  className?: string
  phase?: string
  tp: Array<Partial<LearningObjective> & { code: string; statement: string }>
  materiBuku?: Array<{
    subjectKey: SubjectKey
    title: string
    summary?: string
    suggestedTpCodes?: string[]
    linkNote?: string
  }>
}
