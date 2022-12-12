
exports.activate = function() {
    nova.assistants.registerIssueAssistant("markdown", new IssuesProvider(), {event: "onSave"} )
    console.info("Vale extension for Nova activated.");

}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    console.info("Vale extension for Nova deactivated.");
}


class IssuesProvider {
    lineMatchPattern = /^(.*):(.*):(.*):(.*):(.*)$/;
    termMatchPattern = /'(.*)'/;

    constructor() {

    }

    provideIssues(editor) {
        console.log("in provideIssues");

        // provideIssues() seems to sometimes be called before a document is
        // ready to read. Bail out early if so.
        const docLen = editor.document.length;
        if (docLen === 0) {
            console.log("Bailing out early as document length is 0");
            return [];
        }

        // Defeat a scope issue later
        const lineMatchPattern = this.lineMatchPattern;
        const termMatchPattern = this.termMatchPattern;

        return new Promise(function(resolve, reject) {
            let issues = [];

            let processOptions =  {
                args: ["vale", "--output=line"]
            };

            // If the file is local and has been saved, set some more options
            // relating to its path. Document path will be a string if the
            // document has been saved; "this may be `null` or `undefined`"
            // otherwise.
            if (!editor.document.isRemote && typeof editor.document.path === "string") {
                // Set cwd to parent directory of the file. This allows
                // Vale to check for configuration files in its ordinary
                // way.
                const cwd = editor.document.path.split("/").slice(0, -1).join("/");
                processOptions.cwd = cwd;
                processOptions.args.push(editor.document.path)
            }

            // Initialize process
            const process = new Process("/usr/bin/env", processOptions);
            
            let issueCollections = [];

            // Collect and process error/warning lines
            process.onStdout(function(line) {
                // Line will include spaces at front for formatting and,
                // annoyingly, a line break at the end. Get rid of that stuff
                line = line.trim();

                // Some lines are blank for human-friendly formatting
                // reasons; bail out now if so
                if (line === "") {
                    return;
                }
                //console.log("in onStdout with line: '" + line + "'");

                const matches = line.match(lineMatchPattern);
                if (matches === null) {
                    // The first and last lines have human-friendly stats/info
                    // which won't match the pattern. That's probably the case
                    // here.
                    console.log("No match: '" + line + "'");

                    return;
                }
                
                const termMatches = matches[5].match(termMatchPattern);
 
                console.log("term match: '" + termMatches + "'");

                let issue = new Issue();
                issue.code = matches[4];
                issue.message = matches[5];
                issue.severity = IssueSeverity.Warning;
                issue.line = matches[2];
                issue.column = matches[3];
                issue.endLine = matches[2];
                issue.endColumn = Number(matches[3]) + (termMatches === null ? 1 : termMatches[1].length);
                issues.push(issue);
            });

            process.onStderr(function(line) {
                console.warn("Stderr line from Vale", line);
            });

            process.onDidExit(function(exitStatus) {
                // Status 127 most likely means `vale` is not installed or
                // can't be found in $PATH.
                if (exitStatus == 127) {
                    // Create an "issue" reporting this.
                    let issue = new Issue();
                    issue.message = "Vale utility not found; see Vale Nova extension documentation";
                    issue.severity = IssueSeverity.Error;
                    issue.line = 1;
                    issues.push(issue);
                    resolve(issues);
                }
                // Note: Vale has exit status 2 if it reported errors
                // and 1 if it reported warnings. 0 if neither were found.
                // Thus exitStatus 1 and 2 are both "normal."
                else if (exitStatus < 0 || exitStatus > 2) {
                    reject();
                }
                else {
                    resolve(issues);
                }
            });

            // Trick to send text to process via stdin
            // https://devforum.nova.app/t/formating-code-with-a-cli-tool/1089
            const writer = process.stdin.getWriter();
            writer.ready.then(function() {
                // Get text
                const fullRange = new Range(0, docLen);
                const text = editor.document.getTextInRange(fullRange);
                console.log("in writer.ready callback; doc length: " + text.length);
                writer.write(text);
                writer.close();
            });

            try {
                process.start();
            }
            catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }
}


nova.assistants.registerIssueAssistant("md", new IssuesProvider());

