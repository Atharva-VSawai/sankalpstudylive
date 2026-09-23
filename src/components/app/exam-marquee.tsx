"use client"

// A CSS-only infinite marquee of exam names. No JS animation loop — uses
// a duplicated list + CSS keyframe translateX for a seamless loop.

const EXAMS = ["GATE", "JEE", "NEET", "UPSC", "CAT", "SSC", "Banking", "MPSC", "Placements", "DSA", "General Study"]

export function ExamMarquee() {
  return (
    <div className="relative overflow-hidden py-3 border-y bg-card/30">
      {/* fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      <div className="flex gap-8 animate-marquee whitespace-nowrap">
        {[...EXAMS, ...EXAMS].map((exam, i) => (
          <span key={i} className="text-lg font-bold text-muted-foreground/40 tracking-tight">
            {exam}
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
