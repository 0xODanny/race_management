import type { InputHTMLAttributes } from 'react'
import clsx from 'clsx'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      className={clsx(
        'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-black',
        className,
      )}
      {...rest}
    />
  )
}
