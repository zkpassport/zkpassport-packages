#!/usr/bin/env python3
"""Convert an outer-proof fixture JSON into core_wrapper's Prover.toml.

Usage: fixture_to_prover_toml.py <fixture.json> <Prover.toml> [tamper-mode]

Extends spike/fixture-to-prover-toml.py: the wrapper now drives the library core, so it also
needs `expected_vk_hash` (the fixture's bb `vkeyHashBB`) and the disclose payload
(`disclose_mask` / `disclosed_bytes`) from which the circuit recomputes the parameter
commitment.

Tamper modes (negative controls -- each MUST make the harness exit non-zero):
  --tamper-proof         flip the last hex digit of proof[-1]  -> dies at `bb prove`/`bb verify`
  --tamper-vk-hash       flip the last hex digit of expected_vk_hash
                         -> dies at `nargo execute` ("vk hash mismatch vs fixture")
  --tamper-commitment    bump disclosed_bytes[54]
                         -> dies at `nargo execute` ("param commitment mismatch")
  --tamper-public-input  flip the last hex digit of public_inputs[0]
                         -> dies at `bb prove`/`bb verify` (recursion constraint over the PI
                            array -- the load-bearing control: nothing downstream in-circuit
                            reads public_inputs[0], so this is the only layer that catches it)
  --tamper-vk            flip the last hex digit of verification_key[0]
                         -> empirically dies at `nargo execute`, same assert as --tamper-vk-hash
                            ("vk hash mismatch vs fixture"): verify_outer_proof_core recomputes
                            vk_hash = poseidon2(vk) in-circuit and this wrapper pins it against
                            the fixture's untouched expected_vk_hash, so a tampered vk is caught
                            by that cross-stack pin before recursion is ever exercised at the bb
                            layer. Still a valid non-zero control (a wrong vk cannot silently
                            pass), just not evidence about the bb-level opcode binding on `vk`
                            specifically -- that evidence comes from --tamper-proof and
                            --tamper-public-input, which both do reach bb.
"""
import json
import sys

TAMPER_MODES = (
    "--tamper-proof",
    "--tamper-vk-hash",
    "--tamper-commitment",
    "--tamper-public-input",
    "--tamper-vk",
)


def toml_field_array(name: str, values: list) -> str:
    quoted = ", ".join(f'"{v}"' for v in values)
    return f"{name} = [{quoted}]\n"


def toml_bool_array(name: str, values: list) -> str:
    items = ", ".join("true" if v else "false" for v in values)
    return f"{name} = [{items}]\n"


def toml_int_array(name: str, values: list) -> str:
    items = ", ".join(str(int(v)) for v in values)
    return f"{name} = [{items}]\n"


def flip_last_hex_digit(value: str) -> str:
    return value[:-1] + ("0" if value[-1] != "0" else "1")


def main() -> None:
    fixture_path, out_path = sys.argv[1], sys.argv[2]
    modes = [a for a in sys.argv[3:] if a]
    for m in modes:
        if m not in TAMPER_MODES:
            raise SystemExit(f"unknown tamper mode {m!r}; expected one of {TAMPER_MODES}")

    with open(fixture_path) as f:
        fx = json.load(f)

    vk = fx["vkeyFields"]
    proof = list(fx["proof"])
    pis = fx["publicInputs"]
    expected_vk_hash = fx["vkeyHashBB"]

    if "discloseMask" not in fx or "disclosedBytes" not in fx:
        raise SystemExit(
            f"{fixture_path} has no discloseMask/disclosedBytes -- core_wrapper only drives "
            "the disclose variant (kind=%s)" % fx.get("kind")
        )
    mask = list(fx["discloseMask"])
    disclosed = list(fx["disclosedBytes"])

    assert len(vk) == 115, f"vk len {len(vk)}"
    assert len(proof) == 458, f"proof len {len(proof)}"
    assert len(pis) == 9, f"publicInputs len {len(pis)}"
    assert len(mask) == 90, f"discloseMask len {len(mask)}"
    assert len(disclosed) == 90, f"disclosedBytes len {len(disclosed)}"

    print(
        f"vk={len(vk)} proof={len(proof)} publicInputs={len(pis)} "
        f"mask={len(mask)} disclosed={len(disclosed)} expected_vk_hash={expected_vk_hash}"
    )

    if "--tamper-proof" in modes:
        flipped = flip_last_hex_digit(proof[-1])
        print(f"TAMPER(proof): proof[-1] {proof[-1]} -> {flipped}")
        proof[-1] = flipped

    if "--tamper-vk-hash" in modes:
        flipped = flip_last_hex_digit(expected_vk_hash)
        print(f"TAMPER(vk-hash): {expected_vk_hash} -> {flipped}")
        expected_vk_hash = flipped

    if "--tamper-commitment" in modes:
        old = disclosed[54]
        disclosed[54] = (old + 1) % 256
        print(f"TAMPER(commitment): disclosed_bytes[54] {old} -> {disclosed[54]}")

    if "--tamper-public-input" in modes:
        flipped = flip_last_hex_digit(pis[0])
        print(f"TAMPER(public-input): public_inputs[0] {pis[0]} -> {flipped}")
        pis[0] = flipped

    if "--tamper-vk" in modes:
        flipped = flip_last_hex_digit(vk[0])
        print(f"TAMPER(vk): verification_key[0] {vk[0]} -> {flipped}")
        vk[0] = flipped

    with open(out_path, "w") as f:
        f.write(toml_field_array("verification_key", vk))
        f.write(toml_field_array("proof", proof))
        f.write(toml_field_array("public_inputs", pis))
        f.write(f'expected_vk_hash = "{expected_vk_hash}"\n')
        f.write(toml_bool_array("disclose_mask", mask))
        f.write(toml_int_array("disclosed_bytes", disclosed))


if __name__ == "__main__":
    main()
