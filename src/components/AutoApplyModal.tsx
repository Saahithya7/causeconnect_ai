import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import { Opportunity } from '../types';
import {
  approveAutoApply,
  AutoApplyRequestError,
  AutoApplyResponse,
  executeAutoApply,
  prepareAutoApply
} from '../services/autoApplyService';

type AutoApplyStage =
  | 'checking'
  | 'needs_information'
  | 'ready'
  | 'waiting'
  | 'opening'
  | 'manual'
  | 'submitted'
  | 'waitlisted'
  | 'failed'
  | 'already_applied';

interface AutoApplyModalProps {
  opportunity: Opportunity | null;
  isOpen: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onPromptSignIn: () => void;
  onEditProfile: () => void;
}

const stageLabels: Record<AutoApplyStage, string> = {
  checking: 'Checking eligibility',
  needs_information: 'Needs more information',
  ready: 'Ready for review',
  waiting: 'Waiting for confirmation',
  opening: 'Opening application',
  manual: 'Manual application required',
  submitted: 'Submitted',
  waitlisted: 'Waitlisted',
  failed: 'Failed',
  already_applied: 'Already applied'
};

function sourceHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export const AutoApplyModal: React.FC<AutoApplyModalProps> = ({
  opportunity,
  isOpen,
  isAuthenticated,
  onClose,
  onPromptSignIn,
  onEditProfile
}) => {
  const [stage, setStage] = useState<AutoApplyStage>('checking');
  const [result, setResult] = useState<AutoApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [backgroundConsent, setBackgroundConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !opportunity || !isAuthenticated) return;
    let active = true;
    setStage('checking');
    setResult(null);
    setError(null);
    setReviewConfirmed(false);
    setBackgroundConsent(false);
    setBusy(true);

    prepareAutoApply(opportunity)
      .then((response) => {
        if (!active) return;
        setResult(response);
        setBackgroundConsent(Boolean(response.application?.dataToSubmit.backgroundCheckConsented));
        setStage('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const requestError = cause instanceof AutoApplyRequestError ? cause : null;
        setResult(requestError?.response || null);
        setError(requestError?.message || 'Eligibility could not be checked.');
        if (requestError?.response?.alreadyApplied) {
          const priorStatus = requestError.response.application?.status;
          if (!priorStatus || priorStatus === 'verified' || priorStatus === 'waitlisted') {
            setStage('already_applied');
          } else if (['submitting', 'submitted_unverified', 'verification_inconclusive'].includes(priorStatus)) {
            setStage('manual');
          } else {
            setStage('failed');
          }
        } else if (requestError?.response?.missingInformation?.length) {
          setStage('needs_information');
        } else {
          setStage('failed');
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, opportunity, isAuthenticated]);

  if (!isOpen || !opportunity) return null;

  const application = result?.application;
  const missingInformation = result?.missingInformation || result?.eligibility?.missingInformation || [];
  const eligibilityReasons = result?.eligibility?.reasons || [];
  const requiresBackgroundConsent = Boolean(result?.eligibility?.requiresBackgroundCheckConsent);
  const canConfirm = Boolean(
    application &&
    application.id &&
    application.actionHash &&
    application.draftVersion &&
    reviewConfirmed &&
    (!requiresBackgroundConsent || backgroundConsent)
  );

  const handleConfirm = async () => {
    if (!application || !canConfirm) return;
    setBusy(true);
    setStage('waiting');
    setError(null);
    try {
      await approveAutoApply(
        application.id,
        application.draftVersion,
        application.actionHash,
        backgroundConsent
      );
      setStage('opening');
      const execution = await executeAutoApply(application.id);
      const finalStatus = execution.application?.status || '';
      if (finalStatus === 'verified') {
        setStage('submitted');
      } else if (finalStatus === 'waitlisted') {
        setStage('waitlisted');
      } else if (finalStatus === 'verification_inconclusive' || finalStatus === 'submitted_unverified') {
        setStage('manual');
        setError(execution.error || execution.application?.verificationEvidence ||
          'The website did not provide verifiable confirmation. Check the source directly before taking another action.');
      } else {
        setStage('failed');
        setError(execution.error || 'The application could not be completed.');
      }
      setResult(execution);
    } catch (cause: unknown) {
      const requestError = cause instanceof AutoApplyRequestError ? cause : null;
      const response = requestError?.response;
      setResult(response || result);
      if (response?.application?.status === 'verification_inconclusive') {
        setStage('manual');
      } else {
        setStage('failed');
      }
      setError(requestError?.message || 'The application could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const statusColor = ['submitted', 'waitlisted'].includes(stage)
    ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
    : ['failed', 'needs_information', 'already_applied', 'manual'].includes(stage)
      ? 'text-amber-900 bg-amber-50 border-amber-200'
      : 'text-[#244C3A] bg-[#E8F0E9] border-[#D5E0D7]';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-apply-title"
        className="bg-white border border-[#D5E0D7] rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <header className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-[#D5E0D7] bg-[#E8F0E9]">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#244C3A] text-white p-2">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="auto-apply-title" className="text-xl font-bold text-[#244C3A]">Apply with AI</h2>
              <p className="text-sm text-[#59665C] mt-1">Review eligibility and application details before continuing.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close application assistant" className="rounded-full p-2 hover:bg-white text-[#244C3A]">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-[#244C3A]">
          <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${statusColor}`} aria-live="polite">
            <span className="inline-flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {!isAuthenticated && stage === 'checking' ? 'Sign in required' : stageLabels[stage]}
            </span>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-[#59665C] font-semibold">{opportunity.organization}</p>
            <h3 className="text-lg font-bold mt-1">{opportunity.title}</h3>
            <div className="text-sm text-[#59665C] mt-2 space-y-1">
              <p>{opportunity.location}{opportunity.date ? ` · ${opportunity.date}` : ''}{opportunity.time ? ` · ${opportunity.time}` : ''}</p>
              <p>
                Application source:{' '}
                <a href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                  {sourceHostname(opportunity.sourceUrl)} <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            Automatic form submission is not enabled for this source. CauseConnect will check eligibility and prepare a review, but it will not enter or submit your personal information. Complete the application on the source website.
          </div>

          {result?.eligibility?.status && (
            <p className="text-sm"><span className="font-semibold">Eligibility:</span> {result.eligibility.status}</p>
          )}

          {opportunity.skills.length > 0 && (
            <div>
              <h4 className="text-sm font-bold mb-1">Published skills</h4>
              <p className="text-sm text-[#59665C]">{opportunity.skills.join(', ')}</p>
            </div>
          )}

          <p className="text-sm">
            <span className="font-semibold">Background-check requirement:</span>{' '}
            {opportunity.backgroundCheck === 'required'
              ? 'Required'
              : opportunity.backgroundCheck === 'not-required'
                ? 'Not required'
                : 'Not stated'}
          </p>

          {eligibilityReasons.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <h4 className="text-sm font-bold">Eligibility notes</h4>
              <ul className="list-disc pl-5 text-sm mt-1 space-y-1">
                {eligibilityReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}

          {missingInformation.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <h4 className="text-sm font-bold">Update your profile before proceeding</h4>
              <ul className="list-disc pl-5 text-sm mt-1 space-y-1">
                {missingInformation.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          {application && stage === 'ready' && (
            <div className="rounded-xl border border-[#D5E0D7] p-4 space-y-3">
              <h4 className="text-sm font-bold">Application details to review</h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-[#59665C]">Name</dt>
                <dd>{String(application.dataToSubmit.fullName || 'Missing')}</dd>
                <dt className="text-[#59665C]">Email</dt>
                <dd className="break-all">{String(application.dataToSubmit.email || 'Missing')}</dd>
                <dt className="text-[#59665C]">Age</dt>
                <dd>{String(application.dataToSubmit.verifiedAge || 'Not provided')}</dd>
                <dt className="text-[#59665C]">Phone</dt>
                <dd>{String(application.dataToSubmit.phone || 'Not provided')}</dd>
                <dt className="text-[#59665C]">City</dt>
                <dd>{String(application.dataToSubmit.city || 'Not provided')}</dd>
                <dt className="text-[#59665C]">Skills</dt>
                <dd>{Array.isArray(application.dataToSubmit.skills) ? application.dataToSubmit.skills.join(', ') || 'Not provided' : 'Not provided'}</dd>
                <dt className="text-[#59665C]">Availability</dt>
                <dd>{Array.isArray(application.dataToSubmit.availability) ? application.dataToSubmit.availability.join(', ') || 'Not provided' : 'Not provided'}</dd>
              </dl>
              {application.generatedMotivation && (
                <div>
                  <p className="text-xs text-[#59665C] font-semibold mb-1">Draft statement (AI-generated; review before use)</p>
                  <p className="text-sm rounded-lg bg-[#E8F0E9] p-3">{application.generatedMotivation}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!isAuthenticated ? (
            <button onClick={onPromptSignIn} className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold">
              Sign in to check eligibility
            </button>
          ) : stage === 'needs_information' ? (
            <button onClick={onEditProfile} className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold">
              Update volunteer profile
            </button>
          ) : stage === 'ready' && application ? (
            <div className="space-y-3">
              {requiresBackgroundConsent && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={backgroundConsent} onChange={(event) => setBackgroundConsent(event.target.checked)} className="mt-1" />
                  <span>I explicitly consent to the background check required for this opportunity.</span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-1" />
                <span>I reviewed the application details and authorize CauseConnect to continue with this application.</span>
              </label>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm || busy}
                className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Confirm and continue'}
              </button>
            </div>
          ) : ['manual', 'failed', 'already_applied'].includes(stage) ? (
            <div className="space-y-3">
              {stage === 'manual' && (
                <p className="text-sm font-medium">
                  CauseConnect did not submit the form. Continue on the organization’s page and verify the outcome there.
                </p>
              )}
              <a
                href={opportunity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2"
              >
                Continue on source website <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : null}

          <p className="text-xs text-[#59665C] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Your profile is read from your authenticated account. CauseConnect will not claim an application was submitted without verified confirmation.
          </p>
        </div>
      </section>
    </div>
  );
};
