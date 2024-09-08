# Creating a new module

A module is a component providing specific capabilities to the Circles platform. When a page is created, users can select which module it should use, determining the content and features rendered on that page. In this document we explain how to create a new module "Poke" that will list all the circle members on a page and allow the user to poke them.

[toc]

## Setup

### Creating the module component

Add a new react server component for the module at:

`src/components/modules/poke/poke.tsx`. 

```tsx
"use server";

import { ModulePageProps } from "../dynamic-page";

export default async function PokeModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    return (
        <div className="flex flex-1 flex-col">
           Poke Module Content
        </div>
    );
}
```



### Module config

Add the module to the `modules` constant inside  `src/components/modules/modules.ts` 

```tsx
...
import PokeModule from "./poke/poke";

export const modules: Record<string, Module> = {
	...
    poke: {
        name: "Poke",
        handle: "poke",
        description: "Displays members and allows the user to poke them",
        component: PokeModule,
    },
};

```

**name** - Human readable name of the module.

**handle** - Used to reference the module, should have the same name as the field.

**description** - Brief description of the module.

**component** - React component used to render the module, the one we created in the previous section.

**layoutComponent** - (optional) React component used to render the layout page for the module. Useful if you want sub-navigation menus and pages (see settings module for example). 

Once the module component and config is created, new pages with the module can be added to a circle through the settings menu.



### Module icon

Specify the module icon in the `src/components/modules/page-icon.tsx` file.

```js
export const PageIcon = ({ module, size }: PageIconProps) => {
    switch (module) {
		...
        case "poke":
            return <AiOutlineUnorderedList size={size} />;
		...
    }
};
```



### Add module page

Navigate to the setting menu on the circle and the pages submenu. There you can add a new page and specify the new poke module to be rendered. 



### Add default page

This is an optional step if you want a page with the module to be created by default when a new circle is created. Add the page to the constant `defaultPages`  in `src/lib/data/constants.ts`:

```ts
export const defaultPages: Page[] = [
    ...
    {
        name: "Poke",
        handle: "poke",
        description: "Poke page",
        module: "poke",
    },
];
```

**name** - Name of the page that appears in the top navigation menu.

**handle** - Handle of the page that, e.g. appears in the URL when navigating to the page. 

**description** - Description of the page.

**module** - Handle of the module that is to be rendered on the page. This should be the handle you specified in the module config.

**readOnly** - (optional) Pages with readOnly set to true can't be removed by the administrators. This would be set for essential core pages such as the settings page without which settings can't be changed.



## Implementing Module

Now when we have the basic scaffolding set up for our poke module, we can dive into details on how to implement some functionality for the module.



### Basic Architecture

Modules will generally consist of the following elements:

- **Models** - the data types that will be stored and retrieved from the database and worked with in the various layers of the application. Defined using zod schemas that allows us to validate data.
- **Database interface** - The database collections for the data types that allows us to do CRUD operations on the data, and functions that can be reused.

- **Server Component** - React component that is rendered server-side and does things like fetching data from the database and provides the non-intractable part of the UI.
- **Client Component** - The bulk of most module UI will be in client components that allows for interactivity and state management. 
- **Server Action** - function that can be called from the client component but are executed on the server. Basically a more convenient way to create API endpoints.



### Models

If the module works with new types of data that is to be stored and retrieved from the database we can define the model in the `src/models/models.ts` file. We generally do this by creating a [zod schema](https://zod.dev/?id=basic-usage) for the data and then deriving the type from that schema. The advantage of this is that we get validation methods for every data type we introduce.

So for the poke module we want to store poke information in the database so we added the type Poke like this:

```ts
export const pokeSchema = z.object({
    pokerDid: z.string(),
    pokeeDid: z.string(),
    pokedAt: z.date().optional(),
});

export type Poke = z.infer<typeof pokeSchema>;
```

**pokerDid** - The ID of the user doing the poking.

**pokeeDid** - The ID of the user being poked. 

**pokedAt** - Date of poking

Now when the model is created we can start creating the logic to interface with the database. 



### Database interface

First we create a database collection for our new model in `src/lib/data/db.ts`

```ts
import { Poke, ... } from "@/models/models";

...

export const Pokes = db.collection<Poke>("pokes");
```

Now we can use the `Pokes` constant to interface with the poke collection in the database and do CRUD operations.

In our example we want to create a method to poke a member. We add this method in a new file at `src/lib/data/poke.ts` 

```ts
import { Poke } from "@/models/models";
import { Pokes } from "./db";

export const pokeMember = async (pokerDid: string, pokeeDid: string): Promise<Poke> => {
    let poke: Poke = {
        pokerDid: pokerDid,
        pokeeDid: pokeeDid,
        pokedAt: new Date(),
    };
    await Pokes.insertOne(poke);
    return poke;
};
```



### Server Component

The server component is the component we created in the first step. Since this is a server component we can make calls to the database within it.  Let's start by getting the members and displaying them.

```tsx
"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers } from "@/lib/data/member";

export default async function PokeModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    
    // get circle members from the database
    let members = await getMembers(circle!._id);
    
    return (
        <div className="flex flex-1 flex-col pl-8">
           <h3 className="pb-4">Poke Users</h3>
           {members.map(member => (
               <div key={member._id}>{member.name}</div>
            ))}
        </div>
    );
}
```

The component gets the circle members from the database and displays their names on the page. In order to add interactivity to our component we need to create a client component. 



### Client Component

Client components allow for interactivity and state management. Add a file `poke-list.tsx` in the same folder as the server component.

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Circle, MemberDisplay } from "@/models/models";

type PokeListProps = {
    members: MemberDisplay[];
    circle: Circle;
};

const PokeList = ({ members, circle }: PokeListProps) => {
    const handlePoke = (member: MemberDisplay) => {
        // TODO
        console.log("poked member", member);
    };

    return (
        <div className="flex flex-col gap-2">
            {members.map((member) => (
                <div key={member.userDid} className="flex flex-row items-center gap-2">
                    <div className="w-[200px]">{member.name}</div>
                    <Button onClick={() => handlePoke(member)}>Poke</Button>
                </div>
            ))}
        </div>
    );
};

export default PokeList;

```

And add the component to the server component: 

```tsx
...
import PokeList from "./poke-list"

export default async function PokeModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    ...
    return (
        <div className="flex flex-1 flex-col pl-8">
            <h2 className="pb-4">Poke Users</h2>
            <PokeList members={members} circle={circle} />
        </div>
    );
}
```

In the next step we want to implement the server action that will be invoked when the user clicks on the poke button.



### Server Action

Create server actions in the same folder to handle server-side logic. Add an `actions.ts` file in the same folder.

```tsx
"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { pokeMember } from "@/lib/data/poke";

type PokeMemberResponse = {
    success: boolean;
    message?: string;
};

export const pokeMemberAction = async (pokeeDid: string): Promise<PokeMemberResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();        
        await pokeMember(userDid, pokeeDid);
        return { success: true, message: "Poked user." };
    } catch (error) {
        return { success: false, message: "Failed to poke user. " + error?.toString() };
    }
};
```

Now let's invoke this server action in `poke-list.tsx` when the user clicks on poke button.

```tsx
...
import { pokeMemberAction } from "./actions";

const PokeList = ({ members, circle }: PokeListProps) => {
    ...
    const handlePoke = async (member: MemberDisplay) => {
        let result = await pokeMemberAction(member.userDid);
        console.log("result", result);
    };
    ...
};
```

### Let's have a toast

Congratulation now we have created a simple module that allows users to poke each other. Finally let's just add some additional polish and send out a toast after a poke and make sure the button is disabled while poking is in progress. Here is the final result:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Circle, MemberDisplay } from "@/models/models";
import { pokeMemberAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

type PokeListProps = {
    members: MemberDisplay[];
    circle: Circle;
};

const PokeList = ({ members, circle }: PokeListProps) => {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handlePoke = async (member: MemberDisplay) => {
        startTransition(async () => {
            let result = await pokeMemberAction(member.userDid);
            if (result.success) {
                toast({
                    icon: "success",
                    title: "Member Poked",
                    description: `${member.name} has been poked`,
                });
            } else {
                toast({
                    icon: "error",
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <div className="flex flex-col gap-2">
            {members.map((member) => (
                <div key={member.userDid} className="flex flex-row items-center gap-2">
                    <div className="w-[200px]">{member.name}</div>
                    <Button onClick={() => handlePoke(member)} disabled={isPending}>
                        Poke
                    </Button>
                </div>
            ))}
        </div>
    );
};

export default PokeList;
```





### Access Rules and Features

TODO describe adding new features and checking if user is authorized to use the feature both client-side and server-side.





