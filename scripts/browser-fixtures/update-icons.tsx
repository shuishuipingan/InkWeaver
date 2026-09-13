import type { SVGProps } from 'react'

/** Tiny icon stand-ins keep the UpdateSection interaction harness focused. */
function FixtureIcon(props: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" width="1" height="1" {...props} />
}

export const AlertCircle = FixtureIcon
export const CheckCircle2 = FixtureIcon
export const Clock3 = FixtureIcon
export const Download = FixtureIcon
export const ExternalLink = FixtureIcon
export const LoaderCircle = FixtureIcon
export const Loader2 = FixtureIcon
export const RefreshCw = FixtureIcon
export const RotateCcw = FixtureIcon
export const X = FixtureIcon
