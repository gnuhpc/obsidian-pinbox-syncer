export interface PinboxSyncerSettings {
	accessToken: string;
	syncFolder: string;
	autoSync: boolean;
	syncInterval: number; // in minutes
	lastSyncTime: number;
	enableDataviewIndex: boolean;
	dataviewIndexPath: string;
	firstRun: boolean;
}

export const DEFAULT_SETTINGS: PinboxSyncerSettings = {
	accessToken: '',
	syncFolder: 'Pinbox',
	autoSync: false,
	syncInterval: 60,
	lastSyncTime: 0,
	enableDataviewIndex: false, // Will be set on first run based on Dataview availability
	dataviewIndexPath: 'Pinbox/!Pinbox Index.md',
	firstRun: true
}
