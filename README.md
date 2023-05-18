# cursor-style-manager-wle

Centralises cursor style management in a single component so that the cursor
style can be changed by multiple components at the same time without creating
conflicts.

## Usage

1. Install this library as a dependency: `npm install cursor-style-manager-wle`
2. Add a `cursor-style-manager` component to the scene
  - A dedicated object named `CursorStyleManager` is recommended so that it's easier to pick in the editor
3. Change your `mouse-look` component to a `csm-mouse-look` component if it's present in the scene
  - Make sure to set the `cursorStyleManagerObject` property to the object that contains the `cursor-style-manager` component
4. Change your custom button components so that they extend `CSMComponent` instead of `Component`, and implement the `onButtonClick` method
  - Make sure to set the `cursorStyleManagerObject` property
5. If you rely on the `styleCursor` property in your `cursor` component, then replace the `cursor` component with a `csm-cursor` component
  - Note that other components that reference this component will now have to get the `csm-cursor` component instead of the `cursor` component
  - If this is not possible, then `styleCursor` can't be used. Consider making incompatible components extend the `CSMComponent` class instead of relying on `styleCursor`

## Components

### CSMComponent

An abstract component that provides a helper method for setting the cursor style
in a manager, falling back to direct cursor style management if no manager is
provided.

Extend this class if you want to create custom components that change the cursor
style.

### CSMButtonComponent

An abstract component that implements most of the functionality needed for a
button, and changes cursor styles by using a manager (or directly if no manager
is provided, like CSMComponent).

Extend this class and override the onButtonClick method to create a custom
button class.

### CSMCursor

A replacement for the official cursor component. Provides the same functionality
as the cursor component, but cursor style changes are done via a cursor style
manager (if the styleCursor property is enabled) and the object where the view
component is placed can now be specified.

Use of this component is optional and not recommended. Only use this if you rely
on the styleCursor property.

### CSMMouseLook

A replacement for the official mouse-look component. Provides the same
functionality as the mouse-look component, but cursor style changes are done via
a cursor style manager.

### CursorStyleManagerComponent

Manages the cursor style of an engine canvas. There must only be one manager in
a scene.

This is just the default implementation of a cursor style manager. Custom cursor
style managers with extra functionality can be created, so long as they follow
the ICursorStyleManager interface. For most use-cases, this default
implementation is good enough.