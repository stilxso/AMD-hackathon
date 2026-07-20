"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, Sparkles, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  onFile: (file: File, previewUrl: string) => void;
  onDemo: () => void;
  disabled?: boolean;
};

export function UploadDropzone({ onFile, onDemo, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const { t } = useI18n();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || !files[0]) return;
      const file = files[0];
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      onFile(file, url);
    },
    [onFile],
  );

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "glass-strong relative overflow-hidden group cursor-pointer",
          "flex flex-col items-center justify-center text-center",
          "px-6 py-10 sm:py-14 min-h-[340px] md:min-h-[440px]",
          "transition-all",
          hover ? "ring-2 ring-emerald-400/60 shadow-glow-emerald-lg" : "hover:ring-1 hover:ring-emerald-400/30",
          disabled && "opacity-60 pointer-events-none",
        )}
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-label={t.uploadPrompt}
      >
        {/* animated grid backdrop */}
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-30 animate-grid-drift" />
        <div className="pointer-events-none absolute -inset-40 bg-forest-radial opacity-70" />

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10 mb-6"
        >
          <div className="w-24 h-24 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center animate-pulse-glow">
            <Camera className="w-10 h-10 text-emerald-300" strokeWidth={1.6} />
          </div>
        </motion.div>

        <h2 className="relative z-10 text-3xl sm:text-4xl font-semibold tracking-tight text-white neon-text">
          {t.scanSky}
        </h2>
        <p className="relative z-10 mt-2 max-w-md text-emerald-50/70">
          {t.uploadPrompt}
        </p>

        <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-forest-950 font-medium shadow-glow-emerald transition-colors"
          >
            <ImagePlus className="w-4 h-4" />
            {t.scanSky}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDemo();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-100 transition-colors"
            title="Bypass camera + GPS with a preset Almaty haze photo"
          >
            <Wand2 className="w-4 h-4 text-emerald-300" />
            {t.demoLoad}
          </button>
        </div>

        <div className="relative z-10 mt-6 flex items-center gap-2 text-xs text-emerald-100/50">
          <Sparkles className="w-3.5 h-3.5" />
          PNG · JPG · HEIC · webcam
        </div>
      </motion.div>
    </div>
  );
}
