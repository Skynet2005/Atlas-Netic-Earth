"use client";
import type { ButtonHTMLAttributes } from 'react';
import styles from './switch.module.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked, onCheckedChange, disabled, className, ...props }: Props) {
  const classes = className ? `${styles.root} ${className}` : styles.root;
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    data-state={checked ? 'checked' : 'unchecked'}
    className={classes}
    disabled={disabled}
    onClick={() => onCheckedChange?.(!checked)}
    {...props}
  ><span className={styles.thumb} aria-hidden="true"/></button>;
}
