package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"

	"github.com/pelletier/go-toml/v2"
	"github.com/pelletier/go-toml/v2/unstable"
)

type installConfig struct {
	File            string
	BackupDirectory string
	Command         string
	Server          string
	Data            string
	Magpie          string
}
type configResult struct {
	Changed bool   `json:"changed"`
	Backup  string `json:"backup,omitempty"`
}
type edit struct {
	start, end int
	insert     string
}

var magicKey = []string{"mcp_servers", "hzlinkapi_creator"}
var featureKey = []string{"features", "enable_mcp_apps"}
var bom = []byte{239, 187, 191}

func prefixed(path, prefix []string) bool {
	return len(path) >= len(prefix) && slices.Equal(path[:len(prefix)], prefix)
}
func nodeKey(n *unstable.Node) []string {
	var key []string
	for iter := n.Key(); iter.Next(); {
		key = append(key, string(iter.Node().Data))
	}
	return key
}
func field(m map[string]any, name string) map[string]any {
	value, _ := m[name].(map[string]any)
	return value
}
func quote(s string) string {
	// JSON double-quoted strings also form valid TOML basic strings.
	encoded, _ := json.Marshal(s)
	return string(encoded)
}
func updateConfig(source []byte, cfg installConfig) ([]byte, error) {
	withBOM := bytes.HasPrefix(source, bom)
	source = bytes.TrimPrefix(source, bom)
	var before map[string]any
	if err := toml.Unmarshal(source, &before); err != nil {
		return nil, errors.New("现有 Codex 配置不是有效的 TOML，未作更改")
	}
	var parser unstable.Parser
	parser.Reset(source)
	eol := "\n"
	if bytes.Contains(source, []byte("\r\n")) {
		eol = "\r\n"
	}
	var edits []edit
	var table []string
	featureSet := false
	featureTableAt := -1
	firstTableAt := len(source)
	for parser.NextExpression() {
		node := parser.Expression()
		at, end := int(node.Raw.Offset), int(node.Raw.Offset+node.Raw.Length)
		switch node.Kind {
		case unstable.Table, unstable.ArrayTable:
			table = nodeKey(node)
			// The AST exposes table keys but not the raw header range.
			keyAt := int(node.Child().Raw.Offset)
			at = bytes.LastIndexByte(source[:keyAt], '\n') + 1
			newline := bytes.IndexByte(source[keyAt:], '\n')
			end = len(source)
			if newline >= 0 {
				end = keyAt + newline + 1
			}
			if at < firstTableAt {
				firstTableAt = at
			}
			if prefixed(table, magicKey) {
				edits = append(edits, edit{at, end, ""})
			}
			if slices.Equal(table, []string{"features"}) {
				featureTableAt = end
			}
		case unstable.KeyValue:
			key := append(slices.Clone(table), nodeKey(node)...)
			if prefixed(key, magicKey) {
				edits = append(edits, edit{at, end, ""})
			}
			if slices.Equal(key, featureKey) {
				raw := node.Value().Raw
				edits = append(edits, edit{int(raw.Offset), int(raw.Offset + raw.Length), "true"})
				featureSet = true
			}
			if slices.Equal(key, []string{"features"}) && node.Value().Kind == unstable.InlineTable {
				value := node.Value()
				found := false
				for child := value.Child(); child.Valid(); child = child.Next() {
					if child.Kind == unstable.KeyValue && slices.Equal(nodeKey(child), []string{"enable_mcp_apps"}) {
						raw := child.Value().Raw
						edits = append(edits, edit{int(raw.Offset), int(raw.Offset + raw.Length), "true"})
						found = true
					}
				}
				if !found {
					at := int(value.Raw.Offset) + 1
					suffix := " "
					if value.Child().Valid() {
						suffix = ", "
					}
					edits = append(edits, edit{at, at, " enable_mcp_apps = true" + suffix})
				}
				featureSet = true
			}
		}
	}
	if parser.Error() != nil {
		return nil, errors.New("无法读取 Codex 配置，未作更改")
	}
	if !featureSet {
		if featureTableAt >= 0 {
			prefix := ""
			if featureTableAt == len(source) && len(source) > 0 && source[len(source)-1] != '\n' {
				prefix = eol
			}
			edits = append(edits, edit{featureTableAt, featureTableAt, prefix + "enable_mcp_apps = true" + eol})
		} else {
			// Dotted root key also works with existing dotted feature settings.
			edits = append(edits, edit{firstTableAt, firstTableAt, "features.enable_mcp_apps = true" + eol + eol})
		}
	}
	wanted := map[string]any{
		"command": cfg.Command, "args": []any{cfg.Server}, "tool_timeout_sec": int64(300),
		"env": map[string]any{"HZLINKAPI_MAGIC_DATA_DIR": cfg.Data, "HZLINKAPI_MAGIC_MAGPIE_BIN": cfg.Magpie},
	}
	if reflect.DeepEqual(field(field(before, "mcp_servers"), "hzlinkapi_creator"), wanted) && field(before, "features")["enable_mcp_apps"] == true {
		if withBOM {
			return append(slices.Clone(bom), source...), nil
		}
		return source, nil
	}
	section := strings.Join([]string{
		"", "[mcp_servers.hzlinkapi_creator]", "command = " + quote(cfg.Command),
		"args = [" + quote(cfg.Server) + "]", "tool_timeout_sec = 300",
		"", "[mcp_servers.hzlinkapi_creator.env]",
		"HZLINKAPI_MAGIC_DATA_DIR = " + quote(cfg.Data), "HZLINKAPI_MAGIC_MAGPIE_BIN = " + quote(cfg.Magpie), "",
	}, eol)
	// Insertions at the same position precede replacements.
	sort.SliceStable(edits, func(i, j int) bool {
		if edits[i].start == edits[j].start {
			return edits[i].end < edits[j].end
		}
		return edits[i].start < edits[j].start
	})
	var out bytes.Buffer
	last := 0
	for _, e := range edits {
		if e.start < last || e.start > len(source) || e.end > len(source) {
			return nil, errors.New("无法安全更新此配置格式，原配置已保留")
		}
		out.Write(source[last:e.start])
		out.WriteString(e.insert)
		last = e.end
	}
	out.Write(source[last:])
	if out.Len() > 0 && out.Bytes()[out.Len()-1] != '\n' {
		out.WriteString(eol)
	}
	out.WriteString(section)
	var after map[string]any
	if toml.Unmarshal(out.Bytes(), &after) != nil || !reflect.DeepEqual(field(field(after, "mcp_servers"), "hzlinkapi_creator"), wanted) || field(after, "features")["enable_mcp_apps"] != true {
		return nil, errors.New("无法安全更新此配置格式，原配置已保留")
	}
	for _, config := range []map[string]any{before, after} {
		servers, features := field(config, "mcp_servers"), field(config, "features")
		delete(servers, "hzlinkapi_creator")
		delete(features, "enable_mcp_apps")
		if len(servers) == 0 {
			delete(config, "mcp_servers")
		}
		if len(features) == 0 {
			delete(config, "features")
		}
	}
	if !reflect.DeepEqual(before, after) && !(len(before) == 0 && len(after) == 0) {
		return nil, errors.New("检测到其他配置可能被改动，已停止安装")
	}
	if withBOM {
		return append(slices.Clone(bom), out.Bytes()...), nil
	}
	return out.Bytes(), nil
}

func writeConfig(cfg installConfig) (configResult, error) {
	var result configResult
	original, err := os.ReadFile(cfg.File)
	existed := err == nil
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return result, err
	}
	updated, err := updateConfig(original, cfg)
	if err != nil || bytes.Equal(original, updated) {
		return result, err
	}
	if existed {
		if err = os.MkdirAll(cfg.BackupDirectory, 0700); err != nil {
			return result, err
		}
		dir, err := os.MkdirTemp(cfg.BackupDirectory, "before-install-")
		if err != nil {
			return result, err
		}
		result.Backup = filepath.Join(dir, "config.toml")
		if err = os.WriteFile(result.Backup, original, 0600); err != nil {
			return result, err
		}
	}
	dir := filepath.Dir(cfg.File)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return result, err
	}
	f, err := os.CreateTemp(dir, ".hzlm-config-*")
	if err != nil {
		return result, err
	}
	defer os.Remove(f.Name())
	_, err = f.Write(updated)
	closeErr := f.Close()
	if err != nil {
		return result, err
	}
	if closeErr != nil {
		return result, closeErr
	}
	now, err := os.ReadFile(cfg.File)
	if (existed && (err != nil || !bytes.Equal(now, original))) || (!existed && !errors.Is(err, os.ErrNotExist)) {
		return result, errors.New("Codex 配置刚被其他程序改动，请退出 ChatGPT 后再运行安装器")
	}
	if err = os.Rename(f.Name(), cfg.File); err != nil {
		return result, err
	}
	result.Changed = true
	return result, nil
}
