//import type { Icon } from "lucide-svelte";
import * as Icons from "lucide-svelte";

export type Route = {
	title: string;
	label: string;
	icon: any;
	variant: "default" | "ghost";
    href?: string;
};

export const mainRoutes: Route[] = [
	{
		title: "Dasboard",
		label: "",
		icon: Icons.Home,
		variant: "ghost",
        href: "/",
	},
	{
		title: "Overview",
		label: "",
		icon: Icons.Search,
		variant: "ghost",
        href: "/overview",
	},
	{
		title: "Alerts",
		label: "",
		icon: Icons.Bell,
		variant: "ghost",
        href: "/alerts",
	}
];

export const investigationRoutes: Route[] = [
    {
        title: "Summary",
        label: "",
        icon: Icons.FileText,
        variant: "ghost",
        href: "/case/summary"
    },
    {
        title: "Notes",
        label: "",
        icon: Icons.File,
        variant: "ghost",
        href: "/case/notes"
    },
    {
        title: "Assets",
        label: "",
        icon: Icons.Computer,
        variant: "ghost",
        href: "/case/assets"
    },
    {
        title: "IOC",
        label: "",
        icon: Icons.Biohazard,
        variant: "ghost",
        href: "/case/ioc"
    },
    {
        title: "Timeline",
        label: "",
        icon: Icons.Clock,
        variant: "ghost",
        href: "/case/timeline"
    },
    {
        title: "Graph",
        label: "",
        icon: Icons.ChartNetwork,
        variant: "ghost",
        href: "/case/graph"
    },
    {
        title: "Tasks",
        label: "",
        icon: Icons.CheckCheck,
        variant: "ghost",
        href: "/case/tasks"
    },
    {
        title: "Evidence",
        label: "",
        icon: Icons.FileLock,
        variant: "ghost",
        href: "/case/evidences"
    },
    
]


export const followRoutes: Route[] = [
	{
		title: "Search",
		label: "",
		icon: Icons.Search,
		variant: "ghost",
        href: "/search",
	},
	{
		title: "Activities",
		label: "",
		icon: Icons.ChartBarIncreasing,
		variant: "ghost",
        href: "/activities",
	},
	{
		title: "DIM Tasks",
		label: "",
		icon: Icons.Boxes,
		variant: "ghost",
        href: "/dim-tasks",
	}
];

export const settingsRoutes: Route[] = [
    {
        title: "Settings",
        label: "",
        icon: Icons.Settings,
        variant: "ghost",
        href: "/settings",
    },
    {
        title: "Users",
        label: "",
        icon: Icons.Users,
        variant: "ghost",
        href: "/settings/users",
    },
    {
        title: "Help",
        label: "",
        icon: Icons.CircleHelp,
        variant: "ghost",
        href: "/help",
    }
];