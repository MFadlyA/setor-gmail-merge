"use client";

import * as React from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  RotateCw,
} from "lucide-react";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SeekableVideoPlayer({ src }: { src: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isScrubbing, setIsScrubbing] = React.useState(false);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  };

  const skipBy = (delta: number) => {
    const el = videoRef.current;
    if (!el) return;
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const next = Math.max(0, Math.min(dur || 9999, el.currentTime + delta));
    el.currentTime = next;
    setCurrentTime(next);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current && Number.isFinite(val)) {
      videoRef.current.currentTime = val;
    }
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    const vid = videoRef.current as any;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (vid?.webkitEnterFullscreen) {
      vid.webkitEnterFullscreen();
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="group relative w-full rounded-2xl overflow-hidden bg-black border border-white/10 select-none"
    >
      <div className="relative w-full aspect-video bg-black cursor-pointer" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
          onDurationChange={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
          onTimeUpdate={(e) => {
            if (!isScrubbing) {
              setCurrentTime(e.currentTarget.currentTime);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="h-full w-full object-contain block"
        />

        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 transition-opacity">
            <span className="flex size-14 sm:size-16 items-center justify-center rounded-full bg-sky-500/90 hover:bg-sky-400 text-white shadow-[0_0_35px_rgba(56,189,248,0.65)] ring-4 ring-white/20 transition-transform hover:scale-105">
              <Play className="size-7 fill-white ml-0.5" />
            </span>
          </div>
        )}
      </div>

      {/* Custom Interactive Timeline & Controls */}
      <div className="bg-[#0b0e17] border-t border-white/10 px-3 sm:px-4 py-2.5 space-y-2">
        {/* Draggable & Clickable Seek Bar */}
        <div className="relative flex items-center w-full h-5">
          <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 90.92}
            step={0.1}
            value={currentTime}
            onPointerDown={() => setIsScrubbing(true)}
            onPointerUp={() => setIsScrubbing(false)}
            onTouchStart={() => setIsScrubbing(true)}
            onTouchEnd={() => setIsScrubbing(false)}
            onChange={handleSeekChange}
            aria-label="Geser atau klik untuk memilih detik video"
            className="relative z-10 w-full h-5 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(56,189,248,0.8)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
          />
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-200">
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white transition-colors cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-white" />}
            </button>

            <button
              type="button"
              onClick={() => skipBy(-10)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Mundur 10 detik"
            >
              <RotateCcw className="size-3.5" />
              <span>10s</span>
            </button>

            <button
              type="button"
              onClick={() => skipBy(10)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Maju 10 detik"
            >
              <span>10s</span>
              <RotateCw className="size-3.5" />
            </button>

            <span className="font-mono text-[11px] sm:text-xs text-zinc-300 tabular-nums ml-1">
              <strong className="text-white">{formatTime(currentTime)}</strong>
              <span className="text-zinc-500"> / {formatTime(duration || 90.92)}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title={isMuted ? "Nyalakan suara" : "Bisukan suara"}
            >
              {isMuted ? <VolumeX className="size-4 text-rose-400" /> : <Volume2 className="size-4" />}
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Layar penuh"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
