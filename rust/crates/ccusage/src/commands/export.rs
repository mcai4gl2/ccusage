use std::{
    fs,
    io::{self, BufWriter, Write},
};

use crate::{
    Result,
    cli::{ExportArgs, ExportFormat},
    load_daily_summaries,
};

pub(crate) fn run_export(args: ExportArgs) -> Result<()> {
    let rows = load_daily_summaries(&args.shared, None, false)?;

    let stdout = io::stdout();
    let mut out: Box<dyn Write> = match &args.output {
        Some(path) => Box::new(BufWriter::new(
            fs::File::create(path).map_err(|e| crate::cli_error(e.to_string()))?,
        )),
        None => Box::new(BufWriter::new(stdout.lock())),
    };

    match args.format {
        ExportFormat::Csv => write_csv(&mut out, &rows),
        ExportFormat::JsonLines => write_jsonl(&mut out, &rows),
    }
}

fn write_csv(out: &mut dyn Write, rows: &[crate::UsageSummary]) -> Result<()> {
    writeln!(
        out,
        "date,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,total_cost_usd"
    )?;
    for row in rows {
        writeln!(
            out,
            "{},{},{},{},{},{}",
            row.date.as_deref().unwrap_or(""),
            row.input_tokens,
            row.output_tokens,
            row.cache_creation_tokens,
            row.cache_read_tokens,
            row.total_cost,
        )?;
    }
    Ok(())
}

fn write_jsonl(out: &mut dyn Write, rows: &[crate::UsageSummary]) -> Result<()> {
    for row in rows {
        let line = serde_json::to_string(&serde_json::json!({
            "date": row.date,
            "inputTokens": row.input_tokens,
            "outputTokens": row.output_tokens,
            "cacheCreationTokens": row.cache_creation_tokens,
            "cacheReadTokens": row.cache_read_tokens,
            "totalCost": row.total_cost,
        }))?;
        writeln!(out, "{line}")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ModelBreakdown, UsageSummary};

    fn make_summary(date: &str, input: u64, output: u64, cost: f64) -> UsageSummary {
        UsageSummary {
            date: Some(date.to_string()),
            month: None,
            week: None,
            session_id: None,
            project_path: None,
            last_activity: None,
            first_activity: None,
            input_tokens: input,
            output_tokens: output,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            extra_total_tokens: 0,
            total_cost: cost,
            credits: None,
            message_count: None,
            models_used: vec![],
            model_breakdowns: vec![],
            project: None,
            versions: None,
        }
    }

    #[test]
    fn csv_output_has_header_and_data_row() {
        let rows = vec![make_summary("2026-06-14", 100, 50, 0.05)];
        let mut buf = Vec::new();
        write_csv(&mut buf, &rows).unwrap();
        let text = String::from_utf8(buf).unwrap();
        assert!(text.starts_with("date,input_tokens,output_tokens"));
        assert!(text.contains("2026-06-14,100,50,0,0,0.05"));
    }

    #[test]
    fn jsonl_output_is_valid_json_per_line() {
        let rows = vec![make_summary("2026-06-14", 100, 50, 0.05)];
        let mut buf = Vec::new();
        write_jsonl(&mut buf, &rows).unwrap();
        let text = String::from_utf8(buf).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(parsed["date"], "2026-06-14");
        assert_eq!(parsed["inputTokens"], 100);
        assert_eq!(parsed["totalCost"], 0.05);
    }
}
