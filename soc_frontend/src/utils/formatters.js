// src/utils/formatters.js
// Enterprise SOC formatting and style helpers

export function formatSeverity(severity) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL',
        color: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200',
        dot: 'bg-red-500',
        badge: 'bg-red-50/90 text-red-700 border border-red-200 font-semibold',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        color: 'text-amber-800',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        color: 'text-slate-700',
        bg: 'bg-slate-100',
        border: 'border-slate-200',
        dot: 'bg-slate-500',
        badge: 'bg-slate-100 text-slate-700 border border-slate-200 font-medium',
      };
    case 'LOW':
    default:
      return {
        label: 'LOW',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
        badge: 'bg-blue-50 text-blue-700 border border-blue-200 font-medium',
      };
  }
}

export function formatStatus(status) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return {
        label: 'OPEN',
        color: 'text-amber-800',
        badge: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
      };
    case 'UNDER_INVESTIGATION':
      return {
        label: 'UNDER INVESTIGATION',
        color: 'text-blue-800',
        badge: 'bg-blue-50 text-blue-800 border border-blue-200 font-medium',
      };
    case 'ESCALATED':
      return {
        label: 'ESCALATED (CIRT)',
        color: 'text-indigo-800',
        badge: 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-medium',
      };
    case 'CONFIRMED_ATTACK':
      return {
        label: 'CONFIRMED ATTACK',
        color: 'text-red-700',
        badge: 'bg-red-50 text-red-700 border border-red-200 font-semibold',
      };
    case 'FALSE_POSITIVE':
      return {
        label: 'FALSE POSITIVE',
        color: 'text-slate-600',
        badge: 'bg-slate-100 text-slate-600 border border-slate-200',
      };
    case 'RESOLVED':
      return {
        label: 'RESOLVED',
        color: 'text-emerald-800',
        badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium',
      };
    default:
      return {
        label: status || 'UNKNOWN',
        color: 'text-slate-600',
        badge: 'bg-slate-100 text-slate-600 border border-slate-200',
      };
  }
}

export function formatIdentityVerification(status) {
  switch (status?.toUpperCase()) {
    case 'VERIFIED':
      return {
        label: 'VERIFIED',
        badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium',
        iconColor: 'text-emerald-600',
        statusType: 'success'
      };
    case 'IDENTITY MISMATCH':
    case 'MISMATCH':
      return {
        label: 'IDENTITY MISMATCH',
        badge: 'bg-red-50 text-red-700 border border-red-200 font-semibold',
        iconColor: 'text-red-600',
        statusType: 'danger'
      };
    case 'UNVERIFIED':
      return {
        label: 'UNVERIFIED',
        badge: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
        iconColor: 'text-amber-600',
        statusType: 'warning'
      };
    case 'VERIFICATION DEGRADED':
      return {
        label: 'VERIFICATION DEGRADED',
        badge: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
        iconColor: 'text-amber-600',
        statusType: 'warning'
      };
    case 'NOT AVAILABLE':
    default:
      return {
        label: 'NOT AVAILABLE',
        badge: 'bg-slate-100 text-slate-600 border border-slate-200',
        iconColor: 'text-slate-500',
        statusType: 'neutral'
      };
  }
}

export function getRiskColor(score) {
  if (score >= 85) return 'text-red-700';
  if (score >= 65) return 'text-amber-700';
  if (score >= 40) return 'text-slate-700';
  return 'text-blue-700';
}

export function getRiskBarColor(score) {
  if (score >= 85) return 'bg-red-500';
  if (score >= 65) return 'bg-amber-500';
  if (score >= 40) return 'bg-slate-400';
  return 'bg-blue-500';
}
