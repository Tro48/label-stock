import { useId, type Ref } from 'react';

interface SearchFieldProps {
  searchRef?: Ref<HTMLInputElement> | undefined;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  /** Set, если это единственное поле, куда сканер может вводить код, см. useBarcodeScanner. */
  scannerTarget?: boolean | undefined;
}

export function SearchField({
  searchRef,
  value,
  onChange,
  label,
  placeholder,
  scannerTarget = false,
}: SearchFieldProps) {
  const id = useId();
  return (
    <form role="search" className="toolbar__search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        ref={searchRef}
        type="search"
        className="input input--large"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-scanner-target={scannerTarget ? '' : undefined}
      />
    </form>
  );
}
