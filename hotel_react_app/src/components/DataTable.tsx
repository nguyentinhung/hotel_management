import type { HTMLAttributes, ReactNode } from 'react';

interface DataTableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Shared scroll container for dashboard data tables. */
export default function DataTable({ className = '', children, ...props }: DataTableProps) {
  return <div {...props} className={`data-table-scroll${className ? ` ${className}` : ''}`}>{children}</div>;
}
