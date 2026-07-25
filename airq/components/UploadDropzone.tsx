"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SwapAction } from "@/components/landing/magnetic";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  onFile: (file: File, previewUrl: string, nnOnly: boolean) => void;
  disabled?: boolean;
};

const BRACKETS = [
  "left-3 top-3 border-l border-t",
  "right-3 top-3 border-r border-t",
  "bottom-3 left-3 border-b border-l",
  "bottom-3 right-3 border-b border-r",
];

export function UploadDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Which button opened the picker. A ref, not state: it is read once in the
  // change handler and must not re-render the card between click and pick.
  const nnOnlyRef = useRef(false);
  const [hover, setHover] = useState(false);
  const { t } = useI18n();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || !files[0]) return;
      const file = files[0];
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      onFile(file, url, nnOnlyRef.current);
    },
    [onFile],
  );

  function pick(nnOnly: boolean) {
    nnOnlyRef.current = nnOnly;
    inputRef.current?.click();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        nnOnlyRef.current = false;
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => pick(false)}
      role="button"
      aria-label={t.uploadPrompt}
      data-cursor="grow"
      className={cn(
        "lp-panel-strong group relative flex min-h-[380px] cursor-pointer flex-col justify-end overflow-hidden px-6 py-8 transition-colors duration-500 md:min-h-[460px] md:px-8",
        hover ? "border-white bg-white/[0.06]" : "hover:border-white/30",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {/* measurement lattice, drifting */}
      <div aria-hidden className="lp-lattice pointer-events-none absolute inset-0 opacity-60" />

      {/* viewfinder brackets — they open up as the frame is armed */}
      {BRACKETS.map((c) => (
        <span
          key={c}
          aria-hidden
          className={cn(
            "lp-bracket transition-all duration-500",
            c,
            hover ? "opacity-100" : "opacity-40 group-hover:opacity-80",
          )}
        />
      ))}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="relative">
        <div className="lp-mono flex items-center gap-3 text-white/40">
          <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
          {hover ? t.uploadPrompt : "PNG · JPG · HEIC · webcam"}
        </div>

        <h2 className="lp-display mt-5 text-[clamp(2.4rem,7vw,4rem)]">
          <span className="lp-mask">
            <motion.span
              className="block"
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            >
              {t.scanSky}
            </motion.span>
          </span>
        </h2>

        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/45">{t.uploadPrompt}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <SwapAction
            label={t.scanSky}
            onClick={(e) => {
              e.stopPropagation();
              pick(false);
            }}
          />
          {/* Same photo, no fusion: the network's estimate on its own. Ghost
              styling because the fused result is the one to trust by default. */}
          <SwapAction
            label={t.scanNnOnly}
            variant="ghost"
            title={t.nnOnlyHint}
            onClick={(e) => {
              e.stopPropagation();
              pick(true);
            }}
          />
        </div>

        <div className="mt-5 max-w-xs text-[11px] leading-relaxed text-white/30">{t.nnOnlyHint}</div>
      </div>
    </div>
  );
}
