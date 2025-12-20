export const ENCODING: BufferEncoding = "ascii";

export enum OpCode {
	/** Auxiliary fields. Arbitrary key-value settings, see Auxiliary fields */
	AuxiliaryField = 0xfa,
	/** Database Selector */
	DatabaseSelector = 0xfe,
	/** Hash table sizes for the main keyspace and expires, see Resizedb information */
	ResizeDB = 0xfb,
	/** Expire time in seconds, see Key Expiry Timestamp */
	ExpireTime = 0xfd,
	/** Expire time in milliseconds, see Key Expiry Timestamp */
	ExpireTimeMs = 0xfc,
	/** End of the RDB file */
	EndOfFile = 0xff,
}

export enum ValueType {
	StringEncoded = 0,
	List = 1,
	Set = 2,
	SortedSet = 3,
	Hash = 4,
	Zipmap = 9,
	Ziplist = 10,
	Intset = 11,
	ZipSortedSet = 12,
	ZipHashmap = 13,
	QuickList = 14,
}

export const MAGIC = "REDIS";
export const VERSION_LENGTH = 4;

export enum LengthEncodingType {
	Bits6 = 0b00,
	Bits14 = 0b01,
	Bytes4 = 0b10,
	Special = 0b11,
}

export enum SpecialLengthEncodingSubtype {
	Int8Bit = 0,
	Int16Bit = 1,
	Int32Bit = 2,
	CompressedString = 3,
}
