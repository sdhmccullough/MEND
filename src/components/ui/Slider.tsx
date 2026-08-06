import * as RadixSlider from '@radix-ui/react-slider';

// Stepped slider sized for one-thumb phone use (pain 0-10 is the main case).
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  disabled = false,
}: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  disabled?: boolean;
}) {
  return (
    <RadixSlider.Root
      value={[value]}
      onValueChange={([v]) => onValueChange(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      className="relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-50"
    >
      <RadixSlider.Track className="relative h-2 grow rounded-full border border-line bg-surface-2">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent-strong" />
      </RadixSlider.Track>
      <RadixSlider.Thumb className="block size-6 rounded-full border border-line bg-white shadow transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-110" />
    </RadixSlider.Root>
  );
}
