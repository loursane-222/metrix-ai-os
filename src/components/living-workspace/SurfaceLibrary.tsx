"use client";

import type { ReactNode } from "react";
import type { WorkspaceSurfaceDescriptor } from "@/lib/living-workspace";

type SurfaceFrameProps = { descriptor: WorkspaceSurfaceDescriptor; children: ReactNode };
function SurfaceFrame({ descriptor, children }: SurfaceFrameProps) {
  return <section className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 backdrop-blur-xl" data-surface-type={descriptor.type}><h2 className="font-semibold">{descriptor.title}</h2>{descriptor.description ? <p className="mt-1 text-xs text-[#7C7466]">{descriptor.description}</p> : null}<div className="mt-4">{children}</div></section>;
}
export function ManagementSummarySurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
export function EntityListSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
export function EntityDetailSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
export function MetricSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
export function TimelineSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
/** Form controls register through the existing Universal Input Registry; this component owns presentation only. */
export function FormSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
/** Approval actions are supplied by the existing Business Candidate/Executive Approval adapters. */
export function ApprovalSurface(props: SurfaceFrameProps) { return <SurfaceFrame {...props}/>; }
export function EmptyDataSurface({ descriptor, message }: { descriptor: WorkspaceSurfaceDescriptor; message: string }) { return <SurfaceFrame descriptor={descriptor}><p className="text-sm text-[#8b98a1]">{message}</p></SurfaceFrame>; }
export function ErrorSurface({ descriptor, message }: { descriptor: WorkspaceSurfaceDescriptor; message: string }) { return <SurfaceFrame descriptor={descriptor}><p className="text-sm text-[#ef7b73]">{message}</p></SurfaceFrame>; }
