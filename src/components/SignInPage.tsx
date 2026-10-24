import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { Logo } from './Logo';
import { VolunteerProfile } from '../types';
import {
  supabase,
  isSupabaseConfigured
} from '../lib/supabase';
import { getProfile } from '../services/supabaseService';
import { getAuthRedirectUrl } from '../lib/authConfig';

interface SignInPageProps {
  onSignInSuccess: (userProfile: VolunteerProfile, supabaseUserId?: string) => void;
  onGoToLanding: () => void;
  currentUser: VolunteerProfile;
}

export const SignInPage: React.FC<SignInPageProps> = ({
  onSignInSuccess,
  onGoToLanding,
  currentUser
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState(currentUser.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState(currentUser.name || '');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Password reset state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  // Detect email verification callback messages in URL hash or search params
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      const errorMsg =
        hashParams.get('error_description') ||
        searchParams.get('error_description') ||
        hashParams.get('error') ||
        searchParams.get('error');

      const isSignupSuccess =
        hashParams.get('type') === 'signup' ||
        searchParams.get('type') === 'signup' ||
        hashParams.get('type') === 'email_change';

      if (errorMsg) {
        setErrorMessage(
          `Email verification notice: ${decodeURIComponent(errorMsg.replace(/\+/g, ' '))}`
        );
      } else if (isSignupSuccess) {
        setInfoMessage('Your email address has been verified successfully! You can now sign in.');
      }
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    // Form Validation
    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (isSignUp) {
      if (!fullName.trim()) {
        setErrorMessage('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify both password fields.');
        return;
      }
    }

    setIsLoading(true);

    if (supabase && isSupabaseConfigured()) {
      try {
        if (isSignUp) {
          // 1. Supabase Sign Up Flow
          const redirectUrl = getAuthRedirectUrl();

          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: password,
            options: {
              emailRedirectTo: redirectUrl,
              data: {
                full_name: fullName.trim(),
                name: fullName.trim()
              }
            }
          });

          if (error) {
            setErrorMessage(error.message);
            setIsLoading(false);
            return;
          }

          if (data.user) {
            // Check if email confirmation is required by Supabase
            if (!data.session) {
              setInfoMessage(
                `Registration successful! A verification email has been sent to ${email.trim()}. Please confirm your email in your inbox, then sign in.`
              );
              setIsSignUp(false);
              setIsLoading(false);
              return;
            }

            // Session was created immediately
            let loadedProfile: VolunteerProfile | null = null;
            try {
              const res = await getProfile(data.user.id);
              loadedProfile = res.profile;
            } catch (pErr) {
              console.warn('Profile fetch after signup:', pErr);
            }

            const activeProfile: VolunteerProfile = loadedProfile || {
              ...currentUser,
              name: fullName.trim(),
              email: email.trim()
            };

            setIsLoading(false);
            onSignInSuccess(activeProfile, data.user.id);
            return;
          }
        } else {
          // 2. Supabase Sign In Flow
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password
          });

          if (error) {
            if (error.message?.includes('Invalid login credentials')) {
              setErrorMessage('Invalid email or password. Please verify your credentials or sign up for an account.');
            } else if (error.message?.includes('Email not confirmed')) {
              setErrorMessage('Your email address has not been confirmed yet. Please check your inbox for the confirmation email.');
            } else {
              setErrorMessage(error.message);
            }
            setIsLoading(false);
            return;
          }

          if (data.user && data.session) {
            // Authenticated successfully
            let userProfileFromDb: VolunteerProfile | null = null;
            try {
              const profileRes = await getProfile(data.user.id);
              userProfileFromDb = profileRes.profile;
            } catch (pErr) {
              console.warn('Notice: Profile query did not complete, using user metadata:', pErr);
            }

            const userMetaName = data.user.user_metadata?.full_name || data.user.user_metadata?.name;
            const activeProfile: VolunteerProfile = userProfileFromDb || {
              ...currentUser,
              name: userMetaName || email.trim().split('@')[0],
              email: email.trim()
            };

            setIsLoading(false);
            onSignInSuccess(activeProfile, data.user.id);
            return;
          } else {
            setErrorMessage('Authentication succeeded but session could not be established. Please retry.');
            setIsLoading(false);
            return;
          }
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Authentication error. Please check your network connection.');
        setIsLoading(false);
        return;
      }
    } else {
      setIsLoading(false);
      setErrorMessage('Supabase database client is not configured. Please check your environment variables.');
      return;
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;

    if (supabase && isSupabaseConfigured()) {
      try {
        const redirectUrl = getAuthRedirectUrl();
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
          redirectTo: redirectUrl
        });
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      } catch (err: any) {
        // Continue
      }
    }

    setResetSent(true);
    setTimeout(() => {
      setForgotPasswordOpen(false);
      setResetSent(false);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-[#1A382A] text-[#E8F0E9] flex flex-col justify-between selection:bg-[#D6C49A]/30">
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto w-full px-6 py-5 flex items-center justify-between border-b border-[#315D48]/40">
        <Logo onClick={onGoToLanding} />
        <div className="flex items-center gap-3">
          <button
            onClick={onGoToLanding}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#DFEAE1] hover:text-[#D6C49A] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Public Site</span>
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch max-w-5xl">
          {/* Column 1: Auth Form Card */}
          <div className="lg:col-span-6 bg-[#E8F0E9] text-[#244C3A] rounded-3xl p-8 sm:p-10 shadow-2xl border border-[#D5E0D7] flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#DFEAE1] text-[#244C3A] uppercase tracking-wider">
                    Volunteer Portal
                  </span>
                  <span className="text-[11px] font-bold text-[#315D48] bg-white border border-[#D5E0D7] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#315D48]" />
                    RLS Protected
                  </span>
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#244C3A]">
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </h1>
                <p className="text-sm text-[#59665C] mt-1.5 leading-relaxed">
                  {isSignUp
                    ? 'Join a community of purpose-driven volunteers across education, healthcare, environment, and social impact causes.'
                    : 'Sign in to access your AI match recommendations and approved registrations.'}
                </p>
              </div>

              {/* Status Alert Banners */}
              {errorMessage && (
                <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="font-semibold">{errorMessage}</span>
                </div>
              )}

              {infoMessage && (
                <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{infoMessage}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] placeholder-[#59665C]/50 focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                    Email address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] placeholder-[#59665C]/50 focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#244C3A]">
                      Password *
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetEmail(email);
                          setForgotPasswordOpen(true);
                        }}
                        className="text-xs text-[#315D48] hover:underline font-medium cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A7868] hover:text-[#244C3A]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div>
                    <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                      />
                    </div>
                  </div>
                )}

                {!isSignUp && (
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#59665C]">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 accent-[#244C3A] rounded cursor-pointer"
                      />
                      <span>Keep me signed in on this device</span>
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-[#244C3A] hover:bg-[#315D48] text-white font-semibold text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-70"
                >
                  {isLoading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>{isSignUp ? 'Create Volunteer Account' : 'Sign in to CauseConnect'}</span>
                      <ArrowRight className="w-4 h-4 text-[#D6C49A]" />
                    </>
                  )}
                </button>
              </form>

              {/* Mode Toggle */}
              <div className="mt-6 pt-5 border-t border-[#D5E0D7] text-center">
                <p className="text-xs text-[#59665C]">
                  {isSignUp ? 'Already registered?' : "Don't have an account yet?"}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                    className="font-bold text-[#244C3A] hover:text-[#315D48] underline cursor-pointer ml-1"
                  >
                    {isSignUp ? 'Sign in instead' : 'Create an account'}
                  </button>
                </p>
              </div>
            </div>

            {/* Bottom trust footer */}
            <div className="mt-6 pt-4 border-t border-[#D5E0D7]/60 flex items-center justify-between text-[11px] text-[#5A7868]">
              <span>Verified 501(c)(3) listings only</span>
              <span>Explicit volunteer consent</span>
            </div>
          </div>

          {/* Column 2: Editorial Branding Showcase */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="bg-[#244C3A] border border-[#315D48] rounded-3xl p-8 sm:p-10 text-[#E8F0E9] shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#315D48]/20 rounded-full blur-3xl pointer-events-none" />

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#315D48]/60 border border-[#D6C49A]/30 text-xs text-[#D6C49A] font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explainable AI Matching</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-[#E8F0E9]">
                Volunteering tailored to your causes, skills, and weekly rhythm.
              </h2>

              <p className="text-sm text-[#DFEAE1] mt-4 leading-relaxed font-light">
                Discover curated opportunities across education, healthcare, community food programs, disaster response, and animal welfare. Every match score is transparently decomposed into cause alignment, skill matching, and schedule fit.
              </p>

              <div className="mt-8 pt-6 border-t border-[#315D48] grid grid-cols-3 gap-4">
                <div>
                  <div className="font-serif text-2xl font-bold text-[#D6C49A]">100%</div>
                  <div className="text-[11px] text-[#DFEAE1]/80 mt-0.5">User Consent</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-bold text-[#D6C49A]">8+</div>
                  <div className="text-[11px] text-[#DFEAE1]/80 mt-0.5">Impact Causes</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-bold text-[#D6C49A]">Zero</div>
                  <div className="text-[11px] text-[#DFEAE1]/80 mt-0.5">Hallucinations</div>
                </div>
              </div>
            </div>

            {/* Quick feature callouts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#315D48]/30 border border-[#315D48]/60 rounded-2xl p-5">
                <div className="w-8 h-8 rounded-xl bg-[#244C3A] flex items-center justify-center text-[#D6C49A] mb-3">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-[#E8F0E9]">Transparent Eligibility</h4>
                <p className="text-xs text-[#DFEAE1]/80 mt-1 leading-relaxed">
                  Clear requirements for background checks, minimum ages, and time commitments up front.
                </p>
              </div>

              <div className="bg-[#315D48]/30 border border-[#315D48]/60 rounded-2xl p-5">
                <div className="w-8 h-8 rounded-xl bg-[#244C3A] flex items-center justify-center text-[#D6C49A] mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-[#E8F0E9]">Volunteer-Approved</h4>
                <p className="text-xs text-[#DFEAE1]/80 mt-1 leading-relaxed">
                  Autonomous agents identify matching roles, but registration is never submitted without your explicit approval.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
                Reset your password
              </h3>
              <button
                onClick={() => setForgotPasswordOpen(false)}
                className="text-[#244C3A]/60 hover:text-[#244C3A] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#59665C] mb-4 leading-relaxed">
              Enter your registered email address and we'll send you a link to reset your account password.
            </p>

            {resetSent ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>If an account exists for {resetEmail}, a password recovery link has been sent.</span>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[#244C3A]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full p-2.5 text-xs bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#D5DACA] bg-white text-xs font-semibold text-[#244C3A] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] cursor-pointer"
                  >
                    Send Recovery Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full px-6 py-4 text-center text-xs text-[#5A7868] border-t border-[#315D48]/30">
        © 2026 CauseConnect AI. Powered by Supabase Auth & PostgreSQL RLS.
      </footer>
    </div>
  );
};
