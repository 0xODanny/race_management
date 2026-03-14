import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger'
    size?: 'md' | 'lg'
  },
) {
  const { className, variant = 'primary', size = 'md', ...rest } = props

  const base =
    'inline-flex items-center justify-center rounded-md font-semibold disabled:opacity-50 disabled:pointer-events-none'

  const sizes = {
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  } as const

  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-200 text-black hover:bg-zinc-300',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  } as const

  return <button className={clsx(base, sizes[size], variants[variant], className)} {...rest} />
}
