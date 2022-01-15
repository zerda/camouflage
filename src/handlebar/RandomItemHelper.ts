import logger from "../logger";
/**
 * Defines and registers custom handlebar helper - randomItem
 */
export class RandomItemHelper {
    private Handlebars: any;
    constructor(Handlebars: any) {
        this.Handlebars = Handlebars
    }
    /**
     * Registers randomItem helper
     * - If source or delimiter is not included in the defined handlebar, log an error.
     * - Split the source string with specified delimiter, and return a random item from the array
     * @returns {void}
     */
    register = () => {
        this.Handlebars.registerHelper("randomItem", (context: any) => {
            if (typeof context.hash.source === "undefined" && typeof context.hash.delimiter === "undefined") {
                logger.error("Source / Delimiter not specified.");
            } else {
                const source: string = context.hash.source
                const delimiter: string = context.hash.delimiter
                const items = source.split(delimiter);
                return items[Math.floor(Math.random() * items.length)];
            }
        });
    };
}
