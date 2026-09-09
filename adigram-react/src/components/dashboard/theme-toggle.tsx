import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/lib/theme";

const options: { value: Theme; label: string; icon: typeof Sun; hint: string }[] = [
  { value: "light", label: "Light", icon: Sun, hint: "Bright rooms and printing" },
  { value: "dark", label: "Dark", icon: Moon, hint: "Low light and long sessions" },
  { value: "system", label: "System", icon: Monitor, hint: "Follow this device" },
];

/** A single click flips light and dark, which is what the toggle is for most of
 *  the time; the menu behind it is there for pinning the choice to the device. */
export function ThemeToggle() {
  const { theme, resolved, setTheme, toggle } = useTheme();

  return (
    <div className="flex items-center rounded-full border border-border bg-surface">
      <button
        onClick={toggle}
        aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
        title={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
        className="press grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <Sun
          className={`size-4 transition-all duration-300 ${resolved === "dark" ? "scale-0 -rotate-90 absolute opacity-0" : "scale-100 rotate-0 opacity-100"}`}
        />
        <Moon
          className={`size-4 transition-all duration-300 ${resolved === "dark" ? "scale-100 rotate-0 opacity-100" : "absolute scale-0 rotate-90 opacity-0"}`}
        />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Theme options"
            className="press h-9 rounded-r-full border-l border-border px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            {theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              className="gap-2.5 rounded-xl"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">
                <span className="block text-sm">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
              {theme === option.value && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
