'use client';

// Mounts once in the root layout and hooks window error sources so the
// feedback button can attach recent errors to a report.

import { useEffect } from 'react';
import { installDiagnostics } from '@/lib/diagnostics';

export function DiagnosticsInstaller(): null {
  useEffect(() => {
    installDiagnostics();
  }, []);
  return null;
}

export default DiagnosticsInstaller;
