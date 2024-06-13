# Creating a new module

A module is a component providing specific capabilities to the Circles platform. When a page is created, users can select which module it should use, determining the content and features rendered on that page.



## Creating the module component

Add a new react component for the module at e.g.

`src/components/modules/new-module/new-module.tsx`. 

```tsx
import { ModulePageProps } from "../dynamic-page";

export default async function NewModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    return (
        <div className="flex flex-1 flex-col">
           New Module Content
        </div>
    );
}
```



## Module config

Add the module to the `modules` constant inside  `src/components/modules/modules.ts` 

```tsx
...
import NewModule from "./new-module/new-module";

export const modules: Record<string, Module> = {
	...
    newmodule: {
        name: "New Module",
        handle: "newmodule",
        description: "Example module",
        component: NewModule,
        features: [],
    },
};

```

**name** - Human readable name of the module.

**handle** - Used to reference the module, should have the same name as the field.

**description** - Brief description of the module.

**component** - React component used to render the module (will be created in the next step).

**layoutComponent** - (optional) React component used to render the layout page for the module. Useful if you want sub-navigation menus and pages (see settings module for example). 

**features** - List of features that the module uses. Each feature represents a specific functionality and the access rules of a circle determines which user groups can use the feature.



## Add default page

This is an optional step if you want a page with the module to be created by default when a new circle is created. Add the page to the constant `defaultPages`  in `src/lib/data/constants.ts`:

```ts
export const defaultPages: Page[] = [
    ...
    {
        name: "New Module",
        handle: "newmodule",
        description: "New Module page",
        module: "newmodule",
    },
];
```

**name** - Name of the page that appears in the top navigation menu.

**handle** - Handle of the page that, e.g. appears in the URL when navigating to the page. 

**description** - Description of the page.

**module** - Handle of the module that is to be rendered on the page. This should be the handle you specified in the module config.

**readOnly** - (optional) Pages with readOnly set to true can't be removed by the administrators. This would be set for essential core pages such as the settings page without which settings can't be changed.



## Adding a feature



