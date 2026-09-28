/** String constants — role documents use `code`; không hard-code enum trong logic phân quyền dài hạn. */
export const QUESTION_SCOPE = {
  COMMON: 'Common',
  DEPARTMENT_SPECIFIC: 'DepartmentSpecific',
};

export const QUESTION_KIND = {
  THEORY: 'theory',
  PRACTICE: 'practice',
};

export const ANSWER_TYPE = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
};

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

export const EXAM_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const ATTEMPT_TYPE = {
  PRACTICE: 'practice',
  OFFICIAL: 'official',
};

export const ATTEMPT_STATUS = {
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  EXPIRED: 'expired',
};

export const DOCUMENT_SCOPE = {
  COMMON: 'Common',
  DEPARTMENT_SPECIFIC: 'DepartmentSpecific',
};
