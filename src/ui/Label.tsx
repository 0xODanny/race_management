import type { LabelHTMLAttributes } from 'react'
import clsx from 'clsx'

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  const { className, ...rest } = props
  return <label className={clsx('block text-sm font-semibold text-zinc-800', className)} {...rest} />
}
