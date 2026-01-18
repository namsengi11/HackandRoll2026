import * as React from "react"
import { Circle } from "lucide-react"
import { cn } from "../../lib/utils"

// Simple radio group implementation (for hackathon demo)
interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ value, onValueChange, className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("grid gap-2", className)} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, { 
              checked: child.props.value === value,
              onCheckedChange: () => onValueChange?.(child.props.value)
            });
          }
          return child;
        })}
      </div>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

interface RadioGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  checked?: boolean;
  onCheckedChange?: () => void;
}

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ value, checked, onCheckedChange, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onCheckedChange}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-gray-300 text-primary-600 ring-offset-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center",
          checked && "border-primary-600",
          className
        )}
        {...props}
      >
        {checked && <Circle className="h-2.5 w-2.5 fill-current text-current" />}
      </button>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem }
