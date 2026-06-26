import re

# Mock raw result that the LLM might return
mock_llm_output = """
1. **Design overall project architecture and integration of speech-to-text model**
- Owner: Use
- Deadline: Not specified
2. **Implement AI summarization workflow**
- Owner: Use
- Deadline: Not specified
3. **Coordinate all team members and review pull requests and code quality**
- Owner (who is responsible): Yusuf
- Deadline: Not specified
"""

def test_cleaning(raw_result):
    # Clean up any double asterisks (stars) formatting
    cleaned = raw_result.replace("**", "").replace("*", "")
    
    # Replace any "owner" or "assigned" labels sequentially with Person 1, Person 2, etc.
    owner_pattern = re.compile(r'(?i)\b(owner|assigned)\b(\s*\(who is responsible\))?:?')
    
    counter = [1]
    def replacer(match):
        res = f"Person {counter[0]}"
        if ":" in match.group(0):
            res += ":"
        counter[0] += 1
        return res
        
    cleaned = owner_pattern.sub(replacer, cleaned)
    return cleaned

cleaned_output = test_cleaning(mock_llm_output)
print("=== CLEANED OUTPUT ===")
print(cleaned_output)
print("======================")

# Verify no double asterisks (stars) remain
assert "**" not in cleaned_output, "Asterisks still present!"
# Verify no "Owner" remains
assert "Owner" not in cleaned_output, "Owner word still present!"
assert "owner" not in cleaned_output, "owner word still present!"
# Verify Person 1, Person 2, Person 3 are sequential
assert "Person 1:" in cleaned_output, "Person 1 not found!"
assert "Person 2:" in cleaned_output, "Person 2 not found!"
assert "Person 3:" in cleaned_output, "Person 3 not found!"

print("Verification test passed successfully!")
