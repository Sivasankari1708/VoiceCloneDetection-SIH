// src/utils/formatters.js
// Enterprise SOC formatting and style helpers

export function formatSeverity(severity) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL',
        color: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-800/60',
        dot: 'bg-red-500',
        badge: 'bg-red-950/70 text-red-300 border border-red-700/60',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        color: 'text-orange-400',
        bg: 'bg-orange-950/40',
        border: 'border-orange-800/60',
        dot: 'bg-orange-500',
        badge: 'bg-orange-950/70 text-orange-300 border border-orange-700/60',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        color: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-800/60',
        dot: 'bg-amber-500',
        badge: 'bg-amber-950/70 text-amber-300 border border-amber-700/60',
      };
    case 'LOW':
    default:
      return {
        label: 'LOW',
        color: 'text-blue-400',
        bg: 'bg-blue-950/40',
        border: 'border-blue-800/60',
        dot: 'bg-blue-500',
        badge: 'bg-blue-950/70 text-blue-300 border border-blue-700/60',
      };
  }
}

export function formatStatus(status) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return {
        label: 'OPEN',
        color: 'text-red-300',
        badge: 'bg-red-950/50 text-red-300 border border-red-800/50',
      };
    case 'UNDER_INVESTIGATION':
      return {
        label: 'UNDER INVESTIGATION',
        color: 'text-amber-300',
        badge: 'bg-amber-950/50 text-amber-300 border border-amber-800/50',
      };
    case 'ESCALATED':
      return {
        label: 'ESCALATED (CIRT)',
        color: 'text-purple-300',
        badge: 'bg-purple-950/50 text-purple-300 border border-purple-800/50',
      };
    case 'CONFIRMED_ATTACK':
      return {
        label: 'CONFIRMED ATTACK',
        color: 'text-red-400',
        badge: 'bg-red-900/60 text-red-200 border border-red-600 font-semibold',
      };
    case 'FALSE_POSITIVE':
      return {
        label: 'FALSE POSITIVE',
        color: 'text-slate-400',
        badge: 'bg-slate-800/60 text-slate-300 border border-slate-700',
      };
    case 'RESOLVED':
      return {
        label: 'RESOLVED',
        color: 'text-emerald-300',
        badge: 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50',
      };
    default:
      return {
        label: status || 'UNKNOWN',
        color: 'text-slate-400',
        badge: 'bg-slate-800 text-slate-300 border border-slate-700',
      };
  }
}

export function formatIdentityVerification(status) {
  switch (status?.toUpperCase()) {
    case 'VERIFIED':
      return {
        label: 'VERIFIED',
        badge: 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60',
        iconColor: 'text-emerald-400',
        statusType: 'success'
      };
    case 'IDENTITY MISMATCH':
    case 'MISMATCH':
      return {
        label: 'IDENTITY MISMATCH',
        badge: 'bg-red-950/80 text-red-300 border border-red-700/70 font-semibold',
        iconColor: 'text-red-400',
        statusType: 'danger'
      };
    case 'UNVERIFIED':
      return {
        label: 'UNVERIFIED',
        badge: 'bg-amber-950/60 text-amber-300 border border-amber-800/60',
        iconColor: 'text-amber-400',
        statusType: 'warning'
      };
    case 'VERIFICATION DEGRADED':
      return {
        label: 'VERIFICATION DEGRADED',
        badge: 'bg-amber-950/60 text-amber-300 border border-amber-800/60',
        iconColor: 'text-amber-400',
        statusType: 'warning'
      };
    case 'NOT AVAILABLE':
    default:
      return {
        label: 'NOT AVAILABLE',
        badge: 'bg-slate-800/70 text-slate-400 border border-slate-700',
        iconColor: 'text-slate-400',
        statusType: 'neutral'
      };
  }
}

export function getRiskColor(score) {
  if (score >= 85) return 'text-red-400';
  if (score >= 65) return 'text-orange-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-blue-400';
}

export function getRiskBarColor(score) {
  if (score >= 85) return 'bg-red-500';
  if (score >= 65) return 'bg-orange-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-blue-500';
}
