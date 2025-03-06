export interface Section {
	uuid: string;
	id: string;
	title: string;
	instructor: string;
	dept: string;
	year: number;
	avg: number;
	pass: number;
	fail: number;
	audit: number;
}

export interface Rooms {
	fullname?: string;
	shortname?: string;
	number?: string;
	name?: string;
	address?: string;
	lat?: number;
	lon?: number;
	seats?: number;
	type?: string;
	furniture?: string;
	href?: string;
}
