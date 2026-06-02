'use client';

import * as React from "react"
import { cn } from "@/lib/utils"

interface SelectContextValue {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  disabled?: boolean
}

const SelectContext = React.createContext<SelectContextValue | undefined>(undefined)

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}

const Select = ({ value, onValueChange, disabled, children }: SelectProps) => {
  const [open, setOpen] = React.useState(false)

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, disabled }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectTrigger must be used within Select')

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => !context.disabled && context.setOpen(!context.open)}
      disabled={context.disabled}
      className={cn(
        "relative flex h-10 w-full items-center rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <span className="absolute right-3 text-[10px] opacity-60">▼</span>
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = ({ placeholder, labels }: { placeholder?: string; labels?: Record<string, string> }) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectValue must be used within Select')

  const displayValue = labels?.[context.value] || context.value || placeholder
  return <span>{displayValue}</span>
}

const SelectContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')

  if (!context.open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => context.setOpen(false)}
      />
      <div
        className={cn(
          "absolute z-50 mt-1 w-full rounded-md border border-slate-700 bg-slate-800 shadow-lg",
          className
        )}
      >
        {children}
      </div>
    </>
  )
}

interface SelectItemProps {
  value: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

const SelectItem = ({ value, disabled, className, children }: SelectItemProps) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectItem must be used within Select')

  const handleClick = () => {
    if (!disabled) {
      context.onValueChange(value)
      context.setOpen(false)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-3 text-sm text-white outline-none hover:bg-slate-700",
        disabled && "cursor-not-allowed opacity-50",
        context.value === value && "bg-slate-700",
        className
      )}
    >
      {children}
    </div>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
