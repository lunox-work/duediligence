import { createServer } from "node:http";

/** A requisition status: one of "open", "on_hold", "filled" or "cancelled". */
export type RequisitionStatus = "open" | "on_hold" | "filled" | "cancelled";

/**
 * A requisition, an item of the `POST /requisitions.csv` request body: an
 * object with "id" (a string), "title" (a string, or null or absent when
 * missing), "status", "openings", "filled" and "createdAt" ("YYYY-MM-DDTHH:MM:SSZ",
 * with optional fractional seconds after the seconds and an offset "+HH:MM"
 * or "-HH:MM" in place of "Z").
 */
export interface Requisition {
  id: string;
  title?: string | null;
  status: RequisitionStatus;
  openings: number;
  filled: number;
  createdAt: string;
}

/** The `POST /requisitions.csv` request body: an array of requisitions. */
export type RequisitionsCsvRequest = Requisition[];

/** The 422 body: a message and the id of the first bad requisition in the request's order. */
export interface UnprocessableRequisitionError {
  error: string;
  id: string;
}

/** The 400 body: a message. */
export interface BadRequestError {
  error: string;
}

/**
 * POST /requisitions.csv
 *
 * Request:
 *   Body: JSON, an array of requisitions (`RequisitionsCsvRequest`).
 *
 * Responses:
 *   200  Content-Type: text/csv; charset=utf-8
 *        Content-Disposition: attachment; filename="requisitions.csv"
 *        Body: the CSV. It starts with a UTF-8 byte order mark, the bytes
 *        EF BB BF. Its first row is
 *        "Requisition ID,Title,Status,Openings,Filled,Created". Each
 *        requisition is one row after it, in order of creation time, then of
 *        id compared as strings. Every row, the last included, ends with
 *        "\r\n". The status is written "Open", "On hold", "Filled" or
 *        "Cancelled". The creation time is written as its UTC date,
 *        "YYYY-MM-DD": "2026-03-01T01:30:00+02:00" is written "2026-02-28".
 *        Numbers are written as plain digits. A missing title is an empty
 *        field. For an empty array the body is the byte order mark and the
 *        header row alone.
 *        A title starting with "=", "+", "-", "@", a tab or a "\r" starts
 *        with a single quote "'" before that character; only the first
 *        character is checked: "a=b" is written as it is.
 *        A field holding a comma, a double quote, a "\r" or a "\n", or
 *        starting or ending with a space, is wrapped in double quotes, with
 *        each double quote inside written twice; a field that needs none of
 *        this is written as it is, without quotes. This applies to every
 *        field, the id included, and to the title as changed above.
 *   422  Content-Type: application/json; charset=utf-8
 *        Body: `UnprocessableRequisitionError`, {"error": <a message>,
 *        "id": <that requisition's id>}, when a requisition has an unknown
 *        status, a title that is neither a string nor null, openings or
 *        filled that is not a whole number of at least 0, filled greater
 *        than openings, or a creation time that is not written as above or
 *        names no real time. When several requisitions are bad, the first in
 *        the request's order is the one named. No CSV is sent.
 *   400  Content-Type: application/json; charset=utf-8
 *        Body: `BadRequestError`, {"error": <a message>}, when the body is
 *        not JSON, is JSON but not an array, or holds an item that is not an
 *        object with a string "id".
 */

/**
 * Any method other than POST on /requisitions.csv
 *
 * Responses:
 *   405  Allow: POST
 */

/**
 * Any method on any other path
 *
 * Responses:
 *   404
 */

const server = createServer((_req: any, res: any) => {
  res.statusCode = 501;
  res.end();
});

server.listen(Number(process.env.PORT), process.env.HOST ?? "127.0.0.1");
