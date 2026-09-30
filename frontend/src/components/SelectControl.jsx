import { ChevronDown } from 'lucide-react'

export default function SelectControl({ className = '', wrapperClassName = '', children, ...props }) {
  return (
    <span className={`select-control${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <select className={className} {...props}>{children}</select>
      <ChevronDown className="select-control__icon" aria-hidden="true" />
    </span>
  )
}
