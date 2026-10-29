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
import type { BrowserbaseOpportunity, Opportunity } from '../types';
import {
  approveAutoApply,
  AutoApplyRequestError,
  AutoApplyResponse,
  canReviewLiveListing,
  cancelLiveFormReview,
  executeAutoApply,
  fillLiveFormMissingFields,
  hasLiveEligibilityInformation,
  hasStructuredLiveEligibility,
  prepareAutoApply,
  submitLiveApplication
} from '../services/autoApplyService';

type AutoApplyStage =
  | 'checking'
  | 'opening'
  | 'detecting'
  | 'loading_profile'
  | 'filling_fields'
  | 'needs_information'
  | 'ready'
  | 'waiting'
  | 'submitting'
  | 'manual'
  | 'submitted'
  | 'waitlisted'
  | 'failed'
  | 'already_applied';

interface AutoApplyModalProps {
  opportunity: Opportunity | BrowserbaseOpportunity | null;
  isOpen: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onPromptSignIn: () => void;
  onEditProfile: () => void;
}

const stageLabels: Record<AutoApplyStage, string> = {
  checking: 'Checking eligibility',
  opening: 'Opening application page',
  detecting: 'Detecting form',
  loading_profile: 'Loading profile',
  filling_fields: 'Filling fields',
  needs_information: 'Needs more information',
  ready: 'Waiting for user review',
  waiting: 'Waiting for confirmation',
  submitting: 'Submitting after your confirmation',
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

function isLiveListing(opportunity: Opportunity | BrowserbaseOpportunity): opportunity is BrowserbaseOpportunity {
  return 'event_name' in opportunity;
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
  const [missingValues, setMissingValues] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isOpen || !opportunity || !isAuthenticated) return;
    let active = true;
    const liveListing = isLiveListing(opportunity);
    setStage(liveListing ? 'opening' : 'checking');
    setResult(null);
    setError(null);
    setReviewConfirmed(false);
    setBackgroundConsent(false);
    setMissingValues({});
    setBusy(true);

    prepareAutoApply(opportunity)
      .then((response) => {
        if (!active) return;
        setResult(response);
        setBackgroundConsent(Boolean(response.application?.dataToSubmit.backgroundCheckConsented));
        if (liveListing && response.formReview) {
          if (response.formReview.blockedReason) {
            setError(response.formReview.blockedReason);
            setStage('manual');
          } else {
            setStage(response.formReview.missingRequiredFields.length ? 'needs_information' : 'ready');
          }
        } else {
          setStage('ready');
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const requestError = cause instanceof AutoApplyRequestError ? cause : null;
        setResult(requestError?.response || null);
        setError(requestError?.message || 'Eligibility could not be checked.');
        if (liveListing) {
          setStage('manual');
        } else if (requestError?.response?.alreadyApplied) {
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

  const liveListing = isLiveListing(opportunity);
  const title = liveListing ? opportunity.title || opportunity.event_name : opportunity.title;
  const organization = liveListing
    ? opportunity.organization || opportunity.organizer_name
    : opportunity.organization;
  const location = liveListing ? opportunity.location || opportunity.city : opportunity.location;
  const sourceUrl = liveListing ? opportunity.source_url || '' : opportunity.sourceUrl;
  const skills = liveListing ? opportunity.required_skills : opportunity.skills;
  const description = liveListing ? opportunity.description : opportunity.description;
  const sourceEligibility = liveListing ? opportunity.eligibility : null;
  const canPrepare = !liveListing || canReviewLiveListing(opportunity);
  const liveEligibilityProvided = liveListing && hasLiveEligibilityInformation(opportunity);
  const liveEligibilityStructured = liveListing && hasStructuredLiveEligibility(opportunity);

  const application = result?.application;
  const missingInformation = result?.missingInformation || result?.eligibility?.missingInformation || [];
  const eligibilityReasons = result?.eligibility?.reasons || [];
  const requiresBackgroundConsent = Boolean(result?.eligibility?.requiresBackgroundCheckConsent);
  const formReview = result?.formReview;
  const canConfirm = Boolean(
    application &&
    application.id &&
    application.actionHash &&
    application.draftVersion &&
    (!liveListing || liveEligibilityProvided) &&
    reviewConfirmed &&
    (!requiresBackgroundConsent || backgroundConsent)
  );

  const handleFillMissing = async () => {
    if (!formReview?.sessionId) return;
    const values = formReview.missingRequiredFields
      .filter((field) => field.kind === 'text' || field.kind === 'select')
      .map((field) => ({ id: field.id, value: (missingValues[field.id] || '').trim() }))
      .filter((field) => field.value.length > 0);
    if (!values.length) {
      setError('Enter the missing required details from your own information before continuing.');
      return;
    }

    setBusy(true);
    setStage('filling_fields');
    setError(null);
    try {
      const response = await fillLiveFormMissingFields(formReview.sessionId, values);
      if (!response.formReviewUpdate) throw new Error('The form service did not return an updated review.');
      setResult((current) => current?.formReview
        ? { ...current, formReview: { ...current.formReview, ...response.formReviewUpdate } }
        : current);
      setStage(response.formReviewUpdate.missingRequiredFields.length ? 'needs_information' : 'ready');
      setMissingValues({});
    } catch (cause: unknown) {
      const requestError = cause instanceof AutoApplyRequestError ? cause : null;
      setError(requestError?.message || 'Could not fill those fields.');
      setStage('needs_information');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (liveListing && formReview?.sessionId) {
      if (!reviewConfirmed || formReview.missingRequiredFields.length) return;
      setBusy(true);
      setStage('submitting');
      setError(null);
      try {
        const submission = await submitLiveApplication(formReview.sessionId);
        setResult((current) => ({ ...submission, formReview: current?.formReview }));
        if (submission.result?.verified) {
          setStage('submitted');
        } else {
          setStage('manual');
          setError(submission.result?.evidence || submission.error ||
            'The organization did not provide verifiable confirmation. Check the source website directly.');
        }
      } catch (cause: unknown) {
        const requestError = cause instanceof AutoApplyRequestError ? cause : null;
        setError(requestError?.message || 'The organization did not confirm the submission.');
        setStage('manual');
      } finally {
        setBusy(false);
      }
      return;
    }

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

  const handleClose = async () => {
    if (formReview?.sessionId && !['submitted', 'waitlisted'].includes(stage)) {
      try {
        await cancelLiveFormReview(formReview.sessionId);
      } catch (cause) {
        console.warn('[Apply with AI] Could not close the live form session:', cause);
      }
    }
    onClose();
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
          <button onClick={handleClose} aria-label="Close application assistant" className="rounded-full p-2 hover:bg-white text-[#244C3A]">
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
            <p className="text-xs uppercase tracking-wide text-[#59665C] font-semibold">{organization}</p>
            <h3 className="text-lg font-bold mt-1">{title}</h3>
            <div className="text-sm text-[#59665C] mt-2 space-y-1">
              <p>{location}{liveListing ? (opportunity.date || opportunity.event_time ? ` · ${opportunity.date || opportunity.event_time}` : '') : `${opportunity.date ? ` · ${opportunity.date}` : ''}${opportunity.time ? ` · ${opportunity.time}` : ''}`}</p>
              <p>
                Source listing:{' '}
                {sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                    {sourceHostname(sourceUrl)} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : <span>Not provided</span>}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            {liveListing
              ? 'Live listings are not independently verified. CauseConnect can fill matching form fields from your saved profile and show the values for review. It will not submit until you explicitly confirm.'
              : 'Automatic form submission is not enabled for this source. CauseConnect will check eligibility and prepare a review, but it will not enter or submit your personal information. Complete the application on the source website.'}
          </div>

          {liveListing && formReview && (
            <div className="rounded-xl border border-[#D5E0D7] p-4 space-y-3">
              <h4 className="text-sm font-bold">Application form review</h4>
              <p className="text-xs text-[#59665C]">
                Form found at{' '}
                <a href={formReview.applicationUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">
                  {sourceHostname(formReview.applicationUrl)}
                </a>
                . The browser session expires after five minutes.
              </p>
              <ol className="text-xs text-[#59665C] list-decimal pl-5">
                {formReview.completedStages.map((completedStage) => <li key={completedStage}>{completedStage}</li>)}
              </ol>
              {formReview.fields.length > 0 && (
                <dl className="grid grid-cols-1 gap-2 text-sm">
                  {formReview.fields.map((field) => (
                    <div key={field.id} className="rounded-lg bg-[#E8F0E9] px-3 py-2">
                      <dt className="font-semibold">{field.label}{field.required ? ' (required)' : ''}</dt>
                      <dd className="break-words">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {formReview.missingRequiredFields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">These required fields need your input:</p>
                  {formReview.missingRequiredFields.map((field) => (
                    <label key={field.id} className="block text-sm">
                      <span className="font-medium">{field.label}</span>
                      {field.message && <span className="block text-xs text-amber-900">{field.message}</span>}
                      {field.kind === 'text' || field.kind === 'select' ? (
                        <input
                          type="text"
                          value={missingValues[field.id] || ''}
                          onChange={(event) => setMissingValues((current) => ({ ...current, [field.id]: event.target.value }))}
                          className="mt-1 w-full rounded-lg border border-[#D5E0D7] px-3 py-2"
                          autoComplete="off"
                        />
                      ) : (
                        <span className="block mt-1 text-xs text-amber-900">
                          This control needs direct interaction on the organization’s website; CauseConnect will not set a consent or account-control field.
                        </span>
                      )}
                    </label>
                  ))}
                  {formReview.missingRequiredFields.some((field) => field.kind === 'text' || field.kind === 'select') && (
                    <button
                      onClick={handleFillMissing}
                      disabled={busy || !formReview.missingRequiredFields.some((field) =>
                        (field.kind === 'text' || field.kind === 'select') && Boolean(missingValues[field.id]?.trim())
                      )}
                      className="w-full rounded-xl border border-[#244C3A] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Fill provided information
                    </button>
                  )}
                </div>
              )}
              {stage === 'needs_information' && formReview.missingRequiredFields.some((field) =>
                field.kind === 'checkbox' || field.kind === 'radio' || field.kind === 'unsupported'
              ) && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full rounded-xl border border-[#244C3A] px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  Continue on source website <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {stage === 'submitted' && (
                <p role="status" className="text-sm font-semibold text-emerald-800">
                  Submission confirmed: {result?.result?.evidence}
                </p>
              )}
              {stage === 'manual' && result?.result?.evidence && (
                <p role="status" className="text-sm text-amber-900">{result.result.evidence}</p>
              )}
            </div>
          )}

          {liveListing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Source-provided eligibility is not independently verified.</p>
              <p className="mt-1">
                {sourceEligibility ||
                  (liveEligibilityProvided
                    ? 'Eligibility details are available only in the fields listed below.'
                    : 'Eligibility not provided.')}
              </p>
              {opportunity.min_age != null && <p className="mt-1">Minimum age listed: {opportunity.min_age}</p>}
              {opportunity.max_age != null && <p className="mt-1">Maximum age listed: {opportunity.max_age}</p>}
              {skills.length > 0 && <p className="mt-1">Required skills listed: {skills.join(', ')}</p>}
              {opportunity.background_check_required === null || opportunity.background_check_required === undefined
                ? <p className="mt-1">Background-check requirement: not stated by the listing.</p>
                : null}
              {!liveEligibilityProvided && (
                <p className="mt-2 font-semibold">
                  CauseConnect cannot check this listing against its eligibility rules because none were provided. Verify the requirements with the organization before continuing.
                </p>
              )}
            </div>
          )}

          {result?.eligibility?.status && (!liveListing || liveEligibilityStructured) && (
            <p className="text-sm">
              <span className="font-semibold">{liveListing ? 'Profile check:' : 'Eligibility:'}</span>{' '}
              {result.eligibility.status}
              {liveListing && ' (based only on the information provided; confirm all requirements with the organization)'}
            </p>
          )}
          {liveListing && !liveEligibilityStructured && (
            <p className="text-sm">
              <span className="font-semibold">Profile eligibility check:</span> Not available; the listing does not provide structured eligibility criteria.
            </p>
          )}

          {description && (
            <div>
              <h4 className="text-sm font-bold mb-1">Listing description</h4>
              <p className="text-sm text-[#59665C]">{description}</p>
            </div>
          )}

          {!liveListing && opportunity.skills.length > 0 && (
            <div>
              <h4 className="text-sm font-bold mb-1">Published skills</h4>
              <p className="text-sm text-[#59665C]">{opportunity.skills.join(', ')}</p>
            </div>
          )}

          {!liveListing && (
            <p className="text-sm">
              <span className="font-semibold">Background-check requirement:</span>{' '}
              {opportunity.backgroundCheck === 'required'
                ? 'Required'
                : opportunity.backgroundCheck === 'not-required'
                  ? 'Not required'
                  : 'Not stated'}
            </p>
          )}

          {!canPrepare && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              This listing cannot be prepared because it is missing a title, organization, or valid supported source URL. Open the source listing manually.
            </div>
          )}

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

          {application && stage === 'ready' && !liveListing && (
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
            !liveListing && (
              <button onClick={onEditProfile} className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold">
                Update volunteer profile
              </button>
            )
          ) : stage === 'ready' && (application || (liveListing && formReview)) ? (
            <div className="space-y-3">
              {!liveListing && requiresBackgroundConsent && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={backgroundConsent} onChange={(event) => setBackgroundConsent(event.target.checked)} className="mt-1" />
                  <span>I explicitly consent to the background check required for this opportunity.</span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-1" />
                <span>
                  {liveListing
                    ? 'I reviewed the actual fields and values above and explicitly authorize CauseConnect to submit this application to the organization now.'
                    : 'I reviewed the application details and authorize CauseConnect to continue with this application.'}
                </span>
              </label>
              <button
                onClick={handleConfirm}
                disabled={(liveListing
                  ? !formReview?.sessionId || formReview.missingRequiredFields.length > 0 || !reviewConfirmed
                  : !canConfirm) || busy}
                className="w-full rounded-xl bg-[#244C3A] text-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? stageLabels[stage] : liveListing ? 'Submit application to organization' : 'Confirm and continue'}
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
                href={sourceUrl}
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
