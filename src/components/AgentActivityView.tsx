import React, { useState } from 'react';
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  Search,
  Sparkles,
  Bell,
  RefreshCw,
  CheckCircle2,
  Clock,
  Terminal,
  Filter
} from 'lucide-react';
import { AgentLog } from '../types';

interface AgentActivityViewProps {
  logs: AgentLog[];
  onTriggerAgentRescan: () => Promise<void>;
  isLoading?: boolean;
}

export const AgentActivityView: React.FC<AgentActivityViewProps> = ({
  logs,
  onTriggerAgentRescan,
  isLoading = false
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isScanning, setIsScanning] = useState(false);

  const handleRescan = async () => {
    setIsScanning(true);
    await onTriggerAgentRescan();
    setIsScanning(false);
  };

  const filteredLogs = logs.filter((log) => {
    if (activeFilter === 'all') return true;
    return log.actionType === activeFilter;
  });

  const getIconForType = (type: AgentLog['actionType']) => {
    switch (type) {
      case 'verify':
        return <ShieldCheck className="w-4 h-4 text-[#315D48]" />;
      case 'compliance':
        return <ShieldAlert className="w-4 h-4 text-amber-600" />;
      case 'match':
        return <Sparkles className="w-4 h-4 text-[#244C3A]" />;
      case 'scrape':
        return <Search className="w-4 h-4 text-[#315D48]" />;
      case 'notification':
        return <Bell className="w-4 h-4 text-[#D6C49A]" />;
      default:
        return <Activity className="w-4 h-4 text-[#244C3A]" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
              Agent Activity
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
          </div>
          <p className="text-sm sm:text-base text-[#59665C] mt-1 font-normal">
            Autonomous background telemetry: real-time eligibility audits, opportunity scraping, and consent verification.
          </p>
        </div>

        <button
          onClick={handleRescan}
          disabled={isScanning || isLoading}
          className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white flex items-center gap-2 transition-all shadow-xs self-start sm:self-auto cursor-pointer disabled:opacity-70"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning || isLoading ? 'animate-spin' : ''}`} />
          <span>{isScanning || isLoading ? 'Recording Live Audit...' : 'Trigger Background Rescan'}</span>
        </button>
      </div>

      {/* Safety Policy Banner */}
      <div className="bg-white border border-[#D5E0D7] rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48] shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#244C3A]">Zero Hallucination</div>
            <div className="text-[11px] text-[#59665C] mt-0.5 leading-snug">
              Missing requirements are flagged as "Not confirmed" rather than falsely inferred.
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48] shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#244C3A]">User-in-the-Loop</div>
            <div className="text-[11px] text-[#59665C] mt-0.5 leading-snug">
              No registration requests are transmitted without explicit manual review & approval.
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#244C3A]">Mathematical Matching</div>
            <div className="text-[11px] text-[#59665C] mt-0.5 leading-snug">
              Explainable match scores decomposing cause, skill, schedule, and location points.
            </div>
          </div>
        </div>
      </div>

      {/* Playwright Discovery Agent Status Card */}
      <div className="bg-[#244C3A] text-white rounded-2xl p-5 border border-[#315D48] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#D6C49A]">
            <span className="w-2 h-2 rounded-full bg-[#D6C49A] animate-ping" />
            <span>Autonomous Web Agent: CauseConnect Volunteer Event Finder</span>
          </div>
          <p className="text-xs text-[#DFEAE1] max-w-2xl leading-relaxed">
            Uses server-isolated Playwright with Chromium for read-only live event discovery. Listings are not independently verified, and no registration forms are submitted.
          </p>
        </div>
        <div className="flex-shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-[#1A382A] border border-[#315D48] text-xs font-medium text-[#DFEAE1]">
            Read-Only Web Discovery
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#D5E0D7] shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'verify', 'compliance', 'match', 'scrape', 'notification'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                activeFilter === tab
                  ? 'bg-[#244C3A] text-white shadow-xs'
                  : 'bg-[#E8F0E9]/70 text-[#59665C] hover:text-[#244C3A] hover:bg-[#DFEAE1]'
              }`}
            >
              {tab === 'all' ? `All Records (${logs.length})` : tab}
            </button>
          ))}
        </div>

        <div className="text-xs text-[#5A7868] flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" />
          <span>Supabase Table: <code>agent_runs</code></span>
        </div>
      </div>

      {/* Logs Feed or Clean Empty State */}
      {logs.length === 0 ? (
        <div className="bg-white border border-[#D5E0D7] rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-xs">
          <Activity className="w-12 h-12 text-[#5A7868] mx-auto opacity-50" />
          <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
            No Agent Telemetry Records Found
          </h3>
          <p className="text-xs sm:text-sm text-[#59665C] max-w-md mx-auto leading-relaxed">
            There are currently no background agent logs recorded in the Supabase <code>agent_runs</code> table. Click Trigger Background Rescan to record the first live audit run.
          </p>
          <div className="pt-2">
            <button
              onClick={handleRescan}
              disabled={isScanning}
              className="px-5 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              Run First Agent Audit
            </button>
          </div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-8 text-center space-y-2">
          <p className="text-xs text-[#59665C]">
            No logs match the "{activeFilter}" filter category.
          </p>
          <button
            onClick={() => setActiveFilter('all')}
            className="text-xs font-bold text-[#244C3A] underline cursor-pointer"
          >
            Clear Filter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-white border border-[#D5E0D7] rounded-2xl p-5 shadow-xs hover:border-[#244C3A]/30 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-[#E8F0E9] border border-[#D5E0D7] flex items-center justify-center shrink-0 mt-0.5">
                  {getIconForType(log.actionType)}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-serif text-base font-bold text-[#244C3A]">
                      {log.title}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F0E9] text-[#244C3A] uppercase tracking-wider">
                      {log.actionType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : log.status === 'warning'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {log.status.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs text-[#59665C] leading-relaxed">
                    {log.detail}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-[#5A7868] font-mono whitespace-nowrap self-start sm:self-auto pl-11 sm:pl-0">
                {log.timestamp}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
