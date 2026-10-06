/**
 * Supabase Reports Service
 * Handles user reports submitted against prompts.
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './client';

export type ReportReason =
  | 'spam'
  | 'misleading'
  | 'inappropriate'
  | 'impersonation'
  | 'copyright'
  | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'spam',
    label: 'Spam',
    description: 'Repetitive, low-quality, or unsolicited content',
  },
  {
    value: 'misleading',
    label: 'Misleading',
    description: 'False, deceptive, or inaccurate information',
  },
  {
    value: 'inappropriate',
    label: 'Inappropriate',
    description: 'Offensive, harmful, or violates community guidelines',
  },
  {
    value: 'impersonation',
    label: 'Shows a real person',
    description: 'Uses my image or someone else\'s without consent, or pretends to be them',
  },
  {
    value: 'copyright',
    label: 'Copyright',
    description: 'Reproduces copyrighted work without permission',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else not listed above',
  },
];

export interface SubmitReportData {
  user_id: string;
  prompt_id: string;
  reason: ReportReason;
  /** Optional free-text details. */
  details?: string;
}

/**
 * Submit a report against a prompt.
 *
 * The `prompt_reports` table is insert-only from the app. There is no select
 * policy, so reports can only be reviewed in the Supabase dashboard.
 */
export async function submitReport(
  data: SubmitReportData,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('prompt_reports').insert({
    user_id: data.user_id,
    prompt_id: data.prompt_id,
    reason: data.reason,
    details: data.details?.trim() || null,
  });

  if (error) {
    console.error('Error submitting report:', error);
    return { error };
  }

  return { error: null };
}
