# Creating a new module

A module is a component providing specific capabilities to the Circles platform. When a page is created, users can select which module it should use, determining the content and features rendered on that page.

[toc]

## Setup

### Creating the module component

Add a new react server component for the module at e.g.

`src/components/modules/new-module/new-module.tsx`. 

```tsx
"use server";

import { ModulePageProps } from "../dynamic-page";

export default async function NewModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    return (
        <div className="flex flex-1 flex-col">
           New Module Content
        </div>
    );
}
```



### Module config

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

**component** - React component used to render the module, the one we created in the previous section.

**layoutComponent** - (optional) React component used to render the layout page for the module. Useful if you want sub-navigation menus and pages (see settings module for example). 

**features** - List of features that the module uses. Each feature represents a specific functionality and the access rules of a circle determines which user groups can use the feature.

Once the module component and config is created, new pages with the module can be added to a circle through the settings menu.



### Add default page

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



## Implementing Module

Now when we have the basic scaffolding set up for our new module, we can dive into details on how to implement some functionality for the module.



### Basic Architecture

Modules will generally consist of the following elements:

- **Models** - the data types that will be stored and retrieved from the database and worked with in the various layers of the application. Defined using zod schemas that allows us to validate data.
- **Database interface** - The database collections for the data types that allows us to do CRUD operations on the data, and functions that can be reused.

- **Server Components** - React components that are rendered server-side and does things like fetching data from the database and provides the non-intractable part of the UI.
- **Client Components** - The bulk of most module UI will be in client components that allows for interactivity and state management. 
- **Server Actions** - functions that can be called from the client component but are executed on the server. Basically a more convenient way to create API endpoints.



### Models

If the module works with new types of data that is to be stored and retrieved from the database we can define the model in the `src/models/models.ts` file. We generally do this by creating a [zod schema](https://zod.dev/?id=basic-usage) for the data and then deriving the type from that schema. The advantage of this is that we get validation methods for every data type we introduce.



So for the members module we wanted to store circle membership information in the database so we added the type Member like this:

```ts
export const memberSchema = z.object({
    userDid: z.string(),
    circleId: z.string(),
    userGroups: z.array(z.string()).optional(),
    joinedAt: z.string().date().optional(),
});

export type Member = z.infer<typeof memberSchema>;
```

Now when the model is created we can start creating the logic to interface with the database. 



### Database interface

First we create a database collection for our new model in `src/lib/data/db.ts`

```ts
import { Member, ... } from "@/models/models";

...

export const Members = db.collection<Member>("members");
```

Now we can use the `Members` constant to interface with the members collection in the database and do CRUD operations.

In our example we want to create a method to add a new member and one to get all members. We add this method in a new file at `src/lib/data/member.ts` 

```ts
import { Member } from "@/models/models";
import { Members } from "./db";

export const getMembers = async (circleId: string): Promise<Member[]> => {
    return Members.find({ circleId: circleId }).toArray();
};

export const addMember = async (userDid: string, circleId: string, userGroups: string[]): Promise<Member> => {
    let member: Member = {
        userDid: userDid,
        circleId: circleId,
        userGroups: userGroups,
        joinedAt: new Date(),
    };
    await Members.insertOne(member);
    return member;
};
```



### Server Component

The server component is the component we created in the first step. Since this is a server component we can make calls to the database within it. 

```tsx
"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers } from "@/lib/data/member";

export default async function NewModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    
    // get circle members from the database
    let members = getMembers(circle);
    
    return (
        <div className="flex flex-1 flex-col">
           <h1>New Module Content</h1>
           {members.map(member => (
               <div>{member.name}</div>
            ))}
        </div>
    );
}
```

The component gets the members from the database and displays their names on the page. In order to add interactivity to our component we need to create a client component. 



### Client Component













## Adding a feature



