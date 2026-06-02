"""Shared implementations for PyPI and PubChem lookups."""

import logging

import httpx

logger = logging.getLogger("mcp-api-tools")


def fetch_pypi_package(package_name: str) -> dict:
    """Fetch package metadata from the public PyPI API."""
    logger.info("Fetching PyPI info for package: %s", package_name)
    url = f"https://pypi.org/pypi/{package_name}/json"

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(url)

            if response.status_code == 404:
                return {"error": f"Package '{package_name}' not found on PyPI."}
            response.raise_for_status()

            info = response.json().get("info", {})
            return {
                "package": package_name,
                "summary": info.get("summary"),
                "latest_version": info.get("version"),
                "author": info.get("author"),
                "home_page": info.get("home_page"),
                "license": info.get("license"),
            }
    except httpx.RequestError as exc:
        logger.error("Network error querying PyPI API: %s", exc)
        return {"error": "Failed to communicate with public API gateway."}


def fetch_compound(compound_name: str) -> dict:
    """Fetch compound properties from the public PubChem API."""
    logger.info("Searching chemical database for compound: %s", compound_name)
    url = (
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
        f"{compound_name}/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
    )

    try:
        with httpx.Client(timeout=7.0) as client:
            response = client.get(url)
            if response.status_code == 404:
                return {
                    "error": f"Compound '{compound_name}' not found in the structural engine."
                }
            response.raise_for_status()

            properties = (
                response.json().get("PropertyTable", {}).get("Properties", [{}])[0]
            )
            return {
                "compound": compound_name,
                "database_id": properties.get("CID"),
                "formula": properties.get("MolecularFormula"),
                "molecular_weight": properties.get("MolecularWeight"),
                "iupac_name": properties.get("IUPACName"),
                "connection_status": "Success - Read Only Transaction Committed",
            }
    except Exception as exc:
        logger.error("Database abstraction layer error: %s", exc)
        return {
            "error": "Database connection timeout or internal transaction rollback."
        }
