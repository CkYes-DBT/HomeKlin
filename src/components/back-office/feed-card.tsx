"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StreamStatus } from "@/lib/stream/streams";

// What the parts of one live card on the admin monitor (M1) share: the stream's status, which
// FeedStatus keeps current by polling, so the video frame can say "Siaran terputus" as soon as the chip
// says "Terputus"; the card's <video>, so "Buka" can put it into full screen; and whether the frame
// shows a picture at all (no problem panel over it), so "Buka" is only offered when there is
// something to see. The card's server parts (the signed link, the words) sit inside as children.

type FeedCardState = {
  status: StreamStatus;
  setStatus: (status: StreamStatus) => void;
  /** The card's <video> while it is on the page (FeedVideo hands it over). */
  video: HTMLVideoElement | null;
  setVideo: (video: HTMLVideoElement | null) => void;
  /** True while the frame shows the video, not a problem panel (failed, reloading, ended). */
  showing: boolean;
  setShowing: (showing: boolean) => void;
};

const FeedCardContext = createContext<FeedCardState | null>(null);

export function FeedCard({ initial, children }: { initial: StreamStatus; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  const [showing, setShowing] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  return (
    <FeedCardContext.Provider value={{ status, setStatus, video, setVideo, showing, setShowing }}>{children}</FeedCardContext.Provider>
  );
}

/** The card's shared state; the parts of a live card only render inside <FeedCard>. */
export function useFeedCard(): FeedCardState {
  const state = useContext(FeedCardContext);
  if (!state) throw new Error("A live card's part rendered outside <FeedCard>.");
  return state;
}

/** Whether a stream's frame is covered by its status: the cleaner's phone dropped, or the job ended. */
export function coveredBy(status: StreamStatus): "disconnected" | "ended" | null {
  return status === "disconnected" || status === "ended" ? status : null;
}
