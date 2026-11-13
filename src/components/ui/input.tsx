import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, onClick, onKeyDown, lang, ...props }: React.ComponentProps<"input">) {
  // Native date fields normally open only from the tiny calendar glyph. Open
  // the same browser picker from anywhere in the field, across the application.
  // Keep the canonical value (YYYY-MM-DD) and existing onChange semantics.
  const showDatePicker = (input: HTMLInputElement) => {
    if (type !== "date" && type !== "datetime-local") return
    if (input.disabled || input.readOnly || !input.showPicker) return
    try { input.showPicker() } catch { /* Fallback: native field remains usable. */ }
  }
  return (
    <input
      type={type}
      lang={lang ?? (type === "date" || type === "datetime-local" ? "en-GB" : undefined)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) showDatePicker(event.currentTarget)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
          showDatePicker(event.currentTarget)
        }
      }}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
