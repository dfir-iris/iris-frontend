//import type { Icon } from "lucide-svelte";
import * as Icons from "lucide-svelte";

export type Route = {
	title: string;
	label: string;
	icon: any;
	variant: "default" | "ghost";
    href?: string;
};


export const investigationRoutes: Route[] = [
    {
        title: "Summary",
        label: "",
        icon: Icons.FileText,
        variant: "ghost",
        href: "overview"
    },
    {
        title: "Notes",
        label: "",
        icon: Icons.File,
        variant: "ghost",
        href: "notes"
    },
    {
        title: "Assets",
        label: "",
        icon: Icons.Computer,
        variant: "ghost",
        href: "assets"
    },
    {
        title: "IOC",
        label: "",
        icon: Icons.Biohazard,
        variant: "ghost",
        href: "ioc"
    },
    {
        title: "Timeline",
        label: "",
        icon: Icons.Clock,
        variant: "ghost",
        href: "timeline"
    },
    {
        title: "Graph",
        label: "",
        icon: Icons.ChartNetwork,
        variant: "ghost",
        href: "graph"
    },
    {
        title: "Tasks",
        label: "",
        icon: Icons.CheckCheck,
        variant: "ghost",
        href: "tasks"
    },
    {
        title: "Evidence",
        label: "",
        icon: Icons.FileLock,
        variant: "ghost",
        href: "evidences"
    },
    {
        title: "War Room",
        label: "",
        icon: Icons.ShieldAlert,
        variant: "ghost",
        href: "evidences"
    },
]
