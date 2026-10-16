export interface Project {
	name: string;
	count: number;
}

export const PROJECTS = [
	{ name: "billing-api", count: 9 },
	{ name: "design-kit", count: 3 },
	{ name: "shop-web", count: 15 },
] as const satisfies Project[];

export const STATUS_OPTIONS = {
	BACKLOG: "backlog",
	IN_PROGRESS: "in progress",
	BLOCKED: "blocked",
	DONE: "done",
} as const;

export const STATUS_OPTIONS_LIST = Object.values(STATUS_OPTIONS);

export type Status = (typeof STATUS_OPTIONS)[keyof typeof STATUS_OPTIONS];

export const PRIORITY_OPTIONS = {
	LOW: "low",
	MEDIUM: "medium",
	HIGH: "high",
	CRITICAL: "critical",
} as const;

export const PRIORITY_OPTIONS_LIST = Object.values(PRIORITY_OPTIONS);

export type Priority = (typeof PRIORITY_OPTIONS)[keyof typeof PRIORITY_OPTIONS];

export interface Task {
	id: string;
	title: string;
	status: Status;
	priority: Priority;
	project: string;
	tags: string[];
	date: string;
	description: string;
	progress?: number;
}

export const tasks = [
	{
		id: "SHOP-32",
		title: "Search suggestions send a request per typed character",
		status: "backlog",
		priority: "medium",
		project: "shop-web",
		tags: ["perf", "search"],
		date: "09/24/26",
		description:
			"Search suggestions fire a network request for every character. Debounce the input and cancel stale requests before they reach the API.",
	},
	{
		id: "SHOP-31",
		title: "Cart badge shows a stale count after switching tabs",
		status: "backlog",
		priority: "low",
		project: "shop-web",
		tags: ["cart"],
		date: "09/23/26",
		description:
			"The cart count is not refreshed when the storefront tab regains focus.",
	},
	{
		id: "SHOP-29",
		title: "Order confirmation e-mail is sent twice on slow networks",
		status: "blocked",
		priority: "critical",
		project: "shop-web",
		tags: ["checkout", "emails"],
		date: "09/20/26",
		description:
			"On slow networks, the payment form can be submitted twice. Add an idempotency key and disable the action while the request is pending.",
	},
	{
		id: "SHOP-28",
		title: "placeOrder retries without an idempotency key",
		status: "backlog",
		priority: "high",
		project: "shop-web",
		tags: ["api", "checkout"],
		date: "09/20/26",
		description:
			"Retries need a stable request key so the order service can safely deduplicate them.",
	},
	{
		id: "SHOP-27",
		title: "ProductGrid re-renders on every filter keystroke",
		status: "backlog",
		priority: "medium",
		project: "shop-web",
		tags: ["perf", "catalog"],
		date: "09/18/26",
		description:
			"Move the expensive grid calculation behind a memoized selector and keep the filter input responsive.",
	},
	{
		id: "BILL-17",
		title: "Currency conversion rounds differently from shop-web",
		status: "backlog",
		priority: "medium",
		project: "billing-api",
		tags: ["money"],
		date: "09/16/26",
		description:
			"Billing and storefront use different rounding modes for converted totals.",
	},
	{
		id: "SHOP-26",
		title: "3-D Secure redirect clears the card holder name",
		status: "in progress",
		priority: "high",
		project: "shop-web",
		tags: ["checkout", "payments"],
		date: "09/15/26",
		description:
			"After the bank's 3-D Secure page redirects back, the payment form mounts again and the card holder field is empty. The card number comes back from the provider token, so people do not notice until the payment is declined.",
		progress: 50,
	},
	{
		id: "KIT-6",
		title: "Tooltip closes on scroll inside a modal",
		status: "backlog",
		priority: "medium",
		project: "design-kit",
		tags: ["a11y"],
		date: "09/14/26",
		description:
			"Keep the tooltip open while the modal scroll container is moving.",
	},
	{
		id: "BILL-16",
		title: "Invoice PDF rendering blocks the event loop",
		status: "in progress",
		priority: "high",
		project: "billing-api",
		tags: ["perf", "invoices"],
		date: "09/11/26",
		description:
			"Move PDF rendering to a worker so invoice generation cannot block request handling.",
		progress: 30,
	},
	{
		id: "SHOP-25",
		title: "Image carousel can't be operated from the keyboard",
		status: "backlog",
		priority: "medium",
		project: "shop-web",
		tags: ["a11y", "catalog"],
		date: "09/09/26",
		description:
			"Add roving tabindex and keyboard controls to the image carousel.",
	},
	{
		id: "BILL-15",
		title: "Tax lookup reaches through order.customer.account.region",
		status: "backlog",
		priority: "medium",
		project: "billing-api",
		tags: ["tax"],
		date: "09/07/26",
		description:
			"Replace the deep property access with a typed customer region boundary.",
	},
	{
		id: "SHOP-23",
		title: "VAT rate 0.2 hard-coded in three places",
		status: "backlog",
		priority: "high",
		project: "shop-web",
		tags: ["pricing"],
		date: "09/05/26",
		description: "Centralize tax rates behind the pricing configuration.",
	},
	{
		id: "KIT-4",
		title: "Components use raw hex colors instead of tokens",
		status: "backlog",
		priority: "medium",
		project: "design-kit",
		tags: ["tokens"],
		date: "09/03/26",
		description:
			"Replace raw values with semantic design tokens across the component library.",
	},
	{
		id: "SHOP-22",
		title: "Address step validates fields only on submit",
		status: "backlog",
		priority: "medium",
		project: "shop-web",
		tags: ["checkout"],
		date: "09/01/26",
		description:
			"Validate on blur and preserve field-level errors when users navigate between checkout steps.",
	},
	{
		id: "BILL-14",
		title: "Customer and Account share one mutable address object",
		status: "backlog",
		priority: "medium",
		project: "billing-api",
		tags: ["data"],
		date: "08/30/26",
		description: "Clone address snapshots at the account boundary.",
	},
	{
		id: "KIT-3",
		title: "IconButton copies all Button variants",
		status: "backlog",
		priority: "low",
		project: "design-kit",
		tags: ["components"],
		date: "08/29/26",
		description:
			"Consolidate shared button variants into a single source of truth.",
	},
] as const satisfies Task[];
