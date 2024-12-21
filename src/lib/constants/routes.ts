import { BiohazardIcon, ChartNetworkIcon, CheckCheckIcon, ClockIcon, ComputerIcon, FileIcon, FileLockIcon, FileTextIcon, Icon, ShieldAlert } from "lucide-svelte";


export type Route = {
    title: string;
    label: string;
    icon: typeof Icon;
    variant: "default" | "ghost";
    href?: string;
};


export const investigationRoutes: Route[] = [
    {
        title: "Summary",
        label: "",
        icon: FileTextIcon,
        variant: "ghost",
        href: "overview"
    },
    {
        title: "Notes",
        label: "",
        icon: FileIcon,
        variant: "ghost",
        href: "notes"
    },
    {
        title: "Assets",
        label: "",
        icon: ComputerIcon,
        variant: "ghost",
        href: "assets"
    },
    {
        title: "IOC",
        label: "",
        icon: BiohazardIcon,
        variant: "ghost",
        href: "ioc"
    },
    {
        title: "Timeline",
        label: "",
        icon: ClockIcon,
        variant: "ghost",
        href: "timeline"
    },
    {
        title: "Graph",
        label: "",
        icon: ChartNetworkIcon,
        variant: "ghost",
        href: "graph"
    },
    {
        title: "Tasks",
        label: "",
        icon: CheckCheckIcon,
        variant: "ghost",
        href: "tasks"
    },
    {
        title: "Evidence",
        label: "",
        icon: FileLockIcon,
        variant: "ghost",
        href: "evidence"
    },
    {
        title: "War Room",
        label: "",
        icon: ShieldAlert,
        variant: "ghost",
        href: "war-room"
    },
]
