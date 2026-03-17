import { AppError } from "../errors"
import type { Rect } from "../draw"
import type { UIElement } from "../ui_base"

/**
 * Interface for a widget descriptor that defines the lifecycle of a widget.
 * TState: The type of the widget instance/state object.
 * TProps: The type of the properties passed from the builder node.
 */
export interface WidgetDescriptor<TState = unknown, TProps = unknown> {
  /** Unique identifier for the widget type (e.g., "button", "textbox") */
  id: string

  /** Create a new instance of the widget state */
  create: (id: string) => TState

  /** Initial Z-index for the widget (default: 10) */
  initialZIndex?: number

  /** Get the underlying UIElement from the state */
  getWidget: (state: TState) => UIElement

  /**
   * Mount or update the widget with new props and layout.
   * This is called every frame/render cycle for active widgets.
   */
  mount: (state: TState, props: TProps, rect: Rect, active: boolean) => void

  /**
   * Called when the widget is not used in the current frame (unmounted).
   * Should hide the widget (e.g. set rect to zero) and reset state if necessary.
   */
  unmount?: (state: TState) => void
}

export class WidgetRegistry {
  private readonly widgets = new Map<string, WidgetDescriptor>()

  register<TState, TProps>(descriptor: WidgetDescriptor<TState, TProps>) {
    if (this.widgets.has(descriptor.id)) {
      console.warn(`Widget type "${descriptor.id}" is already registered. Overwriting.`)
    }
    this.widgets.set(descriptor.id, descriptor as WidgetDescriptor)
  }

  get(id: string): WidgetDescriptor | undefined {
    return this.widgets.get(id)
  }

  has(id: string): boolean {
    return this.widgets.has(id)
  }
}

export const widgetRegistry = new WidgetRegistry()
