"use client";

import { useEffect, useRef } from "react";
import { notifyPendingReviewOnce } from "@/lib/actions/account";

/** Dispara (una vez, idempotente vía app_metadata.review_notified) el correo "cuenta en revisión". */
export function PendingReviewNotifier() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    notifyPendingReviewOnce().catch(() => {});
  }, []);
  return null;
}
